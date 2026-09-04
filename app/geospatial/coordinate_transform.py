"""
Coordinate transformation pipeline mapping VLM image pixel detections
to true GIS coordinates (GeoJSON / WGS84 EPSG:4326).
Ported from satquery_backend into root app/ (Option A integration).
"""

from typing import Any, Dict, List, Optional, Tuple, Union

from affine import Affine
from pyproj import Transformer
from rasterio.crs import CRS

from app.core.logger import get_logger

logger = get_logger("geospatial.coordinate_transform")


class CoordinateTransformer:
    """
    Transforms pixel / normalized VLM model predictions into:
    - Native projected CRS coordinates (using raster Affine matrix)
    - WGS84 (EPSG:4326) geographic coordinates (lon, lat)
    - GeoJSON Polygon Features ready for GIS visualization

    Supports Gemini VLM [ymin, xmin, ymax, xmax] 0-1000 bounding boxes,
    relative [0.0-1.0] bounding boxes, and raw pixel bounding boxes.
    """

    def __init__(
        self,
        width: int,
        height: int,
        affine_transform: List[float],
        crs_str: Optional[str] = None,
        crs_epsg: Optional[int] = None,
    ):
        self.width = width
        self.height = height
        # Affine coefficients: [a, b, c, d, e, f]
        self.affine = Affine(*affine_transform) if affine_transform else Affine.identity()
        self.crs_str = crs_str
        self.crs_epsg = crs_epsg
        self.is_georeferenced = bool(crs_str or crs_epsg)

        self.transformer_to_wgs84: Optional[Transformer] = None
        if self.is_georeferenced:
            try:
                src_crs = CRS.from_epsg(crs_epsg) if crs_epsg else CRS.from_string(crs_str)
                # Skip reprojection if already WGS84
                if not (src_crs.is_geographic and (crs_epsg == 4326 or "4326" in str(crs_str))):
                    self.transformer_to_wgs84 = Transformer.from_crs(
                        src_crs, CRS.from_epsg(4326), always_xy=True
                    )
            except Exception as e:
                logger.warning("coord_transformer_init_failed", error=str(e))

    def pixel_to_native(self, col: float, row: float) -> Tuple[float, float]:
        """
        Converts pixel column (x) and row (y) coordinates into
        native raster projected coordinates (X, Y) using the affine transform.
        """
        x, y = self.affine * (col, row)
        return float(x), float(y)

    def native_to_wgs84(self, x: float, y: float) -> Tuple[float, float]:
        """
        Reprojects native CRS coordinates (X, Y) to WGS84 (longitude, latitude).
        Returns (x, y) unchanged if already in WGS84 or transformer is unavailable.
        """
        if self.transformer_to_wgs84:
            lon, lat = self.transformer_to_wgs84.transform(x, y)
            return float(lon), float(lat)
        return float(x), float(y)

    def pixel_to_wgs84(self, col: float, row: float) -> Tuple[float, float]:
        """Directly transforms pixel (col, row) to WGS84 (lon, lat)."""
        x_native, y_native = self.pixel_to_native(col, row)
        return self.native_to_wgs84(x_native, y_native)

    def normalize_box(
        self, box: Union[List[float], Dict[str, float]]
    ) -> Tuple[float, float, float, float]:
        """
        Normalizes various bounding box formats into pixel indices
        (col_min, row_min, col_max, row_max).

        Supported input formats:
        - [ymin, xmin, ymax, xmax] in [0, 1000]  — Gemini VLM standard
        - [ymin, xmin, ymax, xmax] in [0.0, 1.0] — relative normalized
        - [xmin, ymin, xmax, ymax] pixel format
        - Dict with 'ymin', 'xmin', 'ymax', 'xmax' keys
        """
        if isinstance(box, dict):
            ymin = float(box.get("ymin", 0))
            xmin = float(box.get("xmin", 0))
            ymax = float(box.get("ymax", 0))
            xmax = float(box.get("xmax", 0))
        elif isinstance(box, (list, tuple)) and len(box) == 4:
            ymin, xmin, ymax, xmax = [float(v) for v in box]
        else:
            raise ValueError(f"Invalid bounding box structure: {box}")

        # 0-1000 normalized format (Gemini VLM standard)
        if ymax > 1.0 and (ymax <= 1000.0 and xmax <= 1000.0):
            ymin = (ymin / 1000.0) * self.height
            ymax = (ymax / 1000.0) * self.height
            xmin = (xmin / 1000.0) * self.width
            xmax = (xmax / 1000.0) * self.width
        # 0.0-1.0 relative format
        elif ymax <= 1.0 and xmax <= 1.0:
            ymin = ymin * self.height
            ymax = ymax * self.height
            xmin = xmin * self.width
            xmax = xmax * self.width

        # Clamp within raster bounds
        col_min = max(0.0, min(float(xmin), float(self.width)))
        row_min = max(0.0, min(float(ymin), float(self.height)))
        col_max = max(0.0, min(float(xmax), float(self.width)))
        row_max = max(0.0, min(float(ymax), float(self.height)))

        return col_min, row_min, col_max, row_max

    def transform_box_to_geojson(
        self,
        box: Union[List[float], Dict[str, float]],
        label: str = "detection",
        confidence: float = 1.0,
        properties: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Converts a detected bounding box into a GeoJSON Feature with
        Polygon geometry in WGS84 (EPSG:4326).
        """
        col_min, row_min, col_max, row_max = self.normalize_box(box)

        # 4 corners in pixel space: TL → TR → BR → BL → TL (closed ring)
        pixel_corners = [
            (col_min, row_min),
            (col_max, row_min),
            (col_max, row_max),
            (col_min, row_max),
            (col_min, row_min),
        ]

        wgs84_coords = []
        native_coords = []
        for col, row in pixel_corners:
            x_nat, y_nat = self.pixel_to_native(col, row)
            native_coords.append([x_nat, y_nat])
            lon, lat = self.native_to_wgs84(x_nat, y_nat)
            wgs84_coords.append([lon, lat])

        props = properties or {}
        props.update(
            {
                "label": label,
                "confidence": confidence,
                "is_georeferenced": self.is_georeferenced,
                "native_crs": self.crs_epsg or self.crs_str or "UNKNOWN",
                "pixel_bbox": {
                    "col_min": round(col_min, 2),
                    "row_min": round(row_min, 2),
                    "col_max": round(col_max, 2),
                    "row_max": round(row_max, 2),
                    "width": round(col_max - col_min, 2),
                    "height": round(row_max - row_min, 2),
                },
                "native_bbox": {
                    "min_x": min(c[0] for c in native_coords),
                    "min_y": min(c[1] for c in native_coords),
                    "max_x": max(c[0] for c in native_coords),
                    "max_y": max(c[1] for c in native_coords),
                },
            }
        )

        return {
            "type": "Feature",
            "geometry": {"type": "Polygon", "coordinates": [wgs84_coords]},
            "properties": props,
        }

    def transform_polygon_to_geojson(
        self,
        pixel_polygon: List[List[float]],
        label: str = "polygon_detection",
        confidence: float = 1.0,
        properties: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Converts a list of [col, row] pixel vertices into a
        GeoJSON Polygon Feature in WGS84.
        """
        wgs84_coords = []
        for point in pixel_polygon:
            col, row = point[0], point[1]
            lon, lat = self.pixel_to_wgs84(col, row)
            wgs84_coords.append([lon, lat])

        # Ensure ring is closed
        if wgs84_coords and wgs84_coords[0] != wgs84_coords[-1]:
            wgs84_coords.append(wgs84_coords[0])

        props = properties or {}
        props.update(
            {
                "label": label,
                "confidence": confidence,
                "is_georeferenced": self.is_georeferenced,
                "native_crs": self.crs_epsg or self.crs_str or "UNKNOWN",
            }
        )

        return {
            "type": "Feature",
            "geometry": {"type": "Polygon", "coordinates": [wgs84_coords]},
            "properties": props,
        }
