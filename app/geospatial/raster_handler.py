"""
GeoTIFF and Raster metadata handling using Rasterio and PyProj.
Ported from satquery_backend into root app/ (Option A integration).
"""

from __future__ import annotations
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Union

import numpy as np
import rasterio
from rasterio.crs import CRS
from rasterio.warp import transform_bounds
from pyproj import Transformer

from app.core.logger import get_logger

logger = get_logger("geospatial.raster_handler")


class RasterMetadata:
    """Encapsulates spatial and radiometric metadata of a GeoTIFF raster."""

    def __init__(
        self,
        filepath: str,
        width: int,
        height: int,
        count: int,
        crs_str: Optional[str],
        crs_epsg: Optional[int],
        transform: List[float],
        bounds: Dict[str, float],
        wgs84_bounds: Dict[str, float],
        resolution: Tuple[float, float],
        dtypes: List[str],
        nodata: Optional[float] = None,
    ):
        self.filepath = filepath
        self.width = width
        self.height = height
        self.count = count
        self.crs_str = crs_str
        self.crs_epsg = crs_epsg
        self.transform = transform
        self.bounds = bounds
        self.wgs84_bounds = wgs84_bounds
        self.resolution = resolution
        self.dtypes = dtypes
        self.nodata = nodata

    @property
    def crs(self) -> Optional[str]:
        return self.crs_str

    def to_dict(self) -> Dict[str, Any]:
        return {
            "filepath": self.filepath,
            "dimensions": {"width": self.width, "height": self.height, "bands": self.count},
            "crs": {
                "epsg": self.crs_epsg,
                "wkt": self.crs_str,
                "is_geographic": self.crs_epsg == 4326 if self.crs_epsg else False,
            },
            "affine_transform": self.transform,
            "native_bounds": self.bounds,
            "wgs84_bounds": self.wgs84_bounds,
            "resolution": {"x": self.resolution[0], "y": self.resolution[1]},
            "data_types": self.dtypes,
            "nodata_value": self.nodata,
        }


def extract_raster_metadata(filepath: Union[str, Path]) -> RasterMetadata:
    """
    Opens a GeoTIFF and extracts complete geospatial and raster properties.
    Returns a RasterMetadata object with dimensions, CRS, affine transform, bounds, and WGS84 extent.
    """
    path_str = str(filepath)
    with rasterio.open(path_str) as src:
        width = src.width
        height = src.height
        count = src.count
        res = (float(src.res[0]), float(src.res[1]))
        dtypes = [str(d) for d in src.dtypes]
        nodata = float(src.nodata) if src.nodata is not None else None

        # Affine transform coefficients: [a, b, c, d, e, f]
        t = src.transform
        transform_list = [t.a, t.b, t.c, t.d, t.e, t.f]

        # Native CRS bounds
        native_bounds = {
            "left": float(src.bounds.left),
            "bottom": float(src.bounds.bottom),
            "right": float(src.bounds.right),
            "top": float(src.bounds.top),
        }

        # CRS handling
        crs_epsg = src.crs.to_epsg() if src.crs else None
        crs_str = src.crs.to_string() if src.crs else None

        # Calculate WGS84 geographic extent for map UI and downstream coordinate transforms
        wgs84_bounds: Dict[str, float] = {}
        if src.crs:
            try:
                if src.crs.is_geographic and (crs_epsg == 4326 or "4326" in str(crs_str)):
                    wgs84_bounds = {
                        "min_lon": float(src.bounds.left),
                        "min_lat": float(src.bounds.bottom),
                        "max_lon": float(src.bounds.right),
                        "max_lat": float(src.bounds.top),
                    }
                else:
                    min_lon, min_lat, max_lon, max_lat = transform_bounds(
                        src.crs,
                        CRS.from_epsg(4326),
                        src.bounds.left,
                        src.bounds.bottom,
                        src.bounds.right,
                        src.bounds.top,
                    )
                    wgs84_bounds = {
                        "min_lon": float(min_lon),
                        "min_lat": float(min_lat),
                        "max_lon": float(max_lon),
                        "max_lat": float(max_lat),
                    }
            except Exception as e:
                logger.warning("raster_wgs84_reproject_failed", error=str(e), filepath=path_str)
                wgs84_bounds = {
                    "min_lon": float(src.bounds.left),
                    "min_lat": float(src.bounds.bottom),
                    "max_lon": float(src.bounds.right),
                    "max_lat": float(src.bounds.top),
                }
        else:
            logger.warning("raster_no_crs", filepath=path_str)
            wgs84_bounds = {
                "min_lon": float(src.bounds.left),
                "min_lat": float(src.bounds.bottom),
                "max_lon": float(src.bounds.right),
                "max_lat": float(src.bounds.top),
            }

        return RasterMetadata(
            filepath=path_str,
            width=width,
            height=height,
            count=count,
            crs_str=crs_str,
            crs_epsg=crs_epsg,
            transform=transform_list,
            bounds=native_bounds,
            wgs84_bounds=wgs84_bounds,
            resolution=res,
            dtypes=dtypes,
            nodata=nodata,
        )


def read_raster_bands(
    filepath: Union[str, Path], max_dimension: int = 1024
) -> Tuple[np.ndarray, Tuple[int, int]]:
    """
    Reads raster bands into a numpy array, downsampling if larger than max_dimension.
    Returns (array of shape (bands, H, W), original_shape (orig_H, orig_W)).
    """
    with rasterio.open(str(filepath)) as src:
        orig_h, orig_w = src.height, src.width

        # Calculate decimation factor if necessary
        scale = max(orig_h / max_dimension, orig_w / max_dimension, 1.0)
        out_h = int(orig_h / scale)
        out_w = int(orig_w / scale)

        data = src.read(
            out_shape=(src.count, out_h, out_w),
            resampling=rasterio.enums.Resampling.bilinear,
        )
        return data, (orig_h, orig_w)
