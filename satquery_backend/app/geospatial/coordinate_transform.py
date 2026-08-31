"""
Coordinate transformation pipeline mapping VLM image detections to true GIS coordinates (GeoJSON / WGS84).
"""

from typing import Any, Dict, List, Optional, Tuple, Union
from affine import Affine
from pyproj import Transformer
from rasterio.crs import CRS
from app.core.logging_config import logger


class CoordinateTransformer:
    """
    Transforms pixel/normalized model predictions into Native Projected CRS and WGS84 (EPSG:4326).
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
                if not (src_crs.is_geographic and (crs_epsg == 4326 or "4326" in str(crs_str))):
                    self.transformer_to_wgs84 = Transformer.from_crs(
                        src_crs, CRS.from_epsg(4326), always_xy=True
                    )
            except Exception as e:
                logger.warning(f"Failed to initialize pyproj transformer to WGS84: {e}")

    def pixel_to_native(self, col: float, row: float) -> Tuple[float, float]:
        """
        Converts pixel column (x) and row (y) into native raster coordinate (X, Y).
        """
        # Using @ operator for Affine matrix multiplication
        try:
            x, y = self.affine * (col, row)
        except TypeError:
            x, y = self.affine * (col, row)
        return float(x), float(y)

    def native_to_wgs84(self, x: float, y: float) -> Tuple[float, float]:
        """
        Reprojects native coordinates (X, Y) to WGS84 (longitude, latitude).
        """
        if self.transformer_to_wgs84:
            lon, lat = self.transformer_to_wgs84.transform(x, y)
            return float(lon), float(lat)
        # If already WGS84 or cannot transform, return (x, y)
        return float(x), float(y)

    def pixel_to_wgs84(self, col: float, row: float) -> Tuple[float, float]:
        """
        Directly transforms pixel (col, row) to WGS84 (lon, lat).
        """
        x_native, y_native = self.pixel_to_native(col, row)
        return self.native_to_wgs84(x_native, y_native)

    def normalize_box(self, box: Union[List[float], Dict[str, float]]) -> Tuple[float, float, float, float]:
        """
        Normalizes various bounding box formats into pixel indices (col_min, row_min, col_max, row_max).
        Supports:
        - [ymin, xmin, ymax, xmax] in [0, 1000] (Gemini VLM standard normalized box)
        - [ymin, xmin, ymax, xmax] in [0.0, 1.0]
        - [xmin, ymin, xmax, ymax] pixel format
        - Dict with 'ymin', 'xmin', 'ymax', 'xmax'
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

        # Check if 0-1000 normalized format (Gemini standard)
        if ymax > 1.0 and (ymax <= 1000.0 and xmax <= 1000.0):
            ymin = (ymin / 1000.0) * self.height
            ymax = (ymax / 1000.0) * self.height
            xmin = (xmin / 1000.0) * self.width
            xmax = (xmax / 1000.0) * self.width
        # Check if 0.0 - 1.0 relative format
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
        properties: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Converts a detected bounding box into a standard GeoJSON Feature with Polygon geometry in WGS84.
        """
        col_min, row_min, col_max, row_max = self.normalize_box(box)

        # 4 corners in pixel space (Top-Left -> Top-Right -> Bottom-Right -> Bottom-Left -> Top-Left)
        pixel_corners = [
            (col_min, row_min),
            (col_max, row_min),
            (col_max, row_max),
            (col_min, row_max),
            (col_min, row_min),
        ]

        # Convert each corner to WGS84 (lon, lat)
        wgs84_coords = []
        native_coords = []
        for col, row in pixel_corners:
            x_nat, y_nat = self.pixel_to_native(col, row)
            native_coords.append([x_nat, y_nat])
            lon, lat = self.native_to_wgs84(x_nat, y_nat)
            wgs84_coords.append([lon, lat])

        props = properties or {}
        props.update({
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
            }
        })

        return {
            "type": "Feature",
            "geometry": {
                "type": "Polygon",
                "coordinates": [wgs84_coords]
            },
            "properties": props
        }

    def transform_polygon_to_geojson(
        self,
        pixel_polygon: List[List[float]],
        label: str = "polygon_detection",
        confidence: float = 1.0,
        properties: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Converts a list of [col, row] pixel vertices into GeoJSON Polygon Feature in WGS84.
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
        props.update({
            "label": label,
            "confidence": confidence,
            "is_georeferenced": self.is_georeferenced,
            "native_crs": self.crs_epsg or self.crs_str or "UNKNOWN",
        })

        return {
            "type": "Feature",
            "geometry": {
                "type": "Polygon",
                "coordinates": [wgs84_coords]
            },
            "properties": props
        }
