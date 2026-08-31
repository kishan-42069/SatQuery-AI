"""
High-dynamic-range GeoTIFF to 8-bit RGB Web Preview Converter.
"""

from __future__ import annotations
from pathlib import Path
from typing import Optional, Union
import numpy as np
from PIL import Image
from app.geospatial.raster_handler import read_raster_bands
from app.core.logging_config import logger


def normalize_band_percentile(band: np.ndarray, nodata: Optional[float] = None) -> np.ndarray:
    """
    Applies robust 2% - 98% percentile linear contrast stretching to normalize
    12-bit, 16-bit, float, or SAR values to 0-255 uint8 range.
    """
    valid_mask = np.isfinite(band)
    if nodata is not None:
        valid_mask = valid_mask & (band != nodata)

    valid_vals = band[valid_mask]
    if valid_vals.size == 0:
        return np.zeros_like(band, dtype=np.uint8)

    p2 = np.percentile(valid_vals, 2)
    p98 = np.percentile(valid_vals, 98)

    if p98 <= p2:
        p2 = valid_vals.min()
        p98 = valid_vals.max()

    if p98 <= p2:
        return np.zeros_like(band, dtype=np.uint8)

    stretched = np.clip((band - p2) / (p98 - p2), 0.0, 1.0) * 255.0
    stretched[~valid_mask] = 0
    return stretched.astype(np.uint8)


def generate_rgb_preview(
    raster_path: Union[str, Path],
    output_png_path: Union[str, Path],
    max_dimension: int = 1024,
    nodata: Optional[float] = None
) -> Path:
    """
    Generates a web-renderable PNG preview from any GeoTIFF file.
    """
    out_path = Path(output_png_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    data, _ = read_raster_bands(raster_path, max_dimension=max_dimension)
    num_bands = data.shape[0]

    if num_bands == 1:
        # Grayscale / SAR / Elevation
        gray = normalize_band_percentile(data[0], nodata)
        img = Image.fromarray(gray, mode="L")
    elif num_bands == 2:
        # Dual band (e.g. SAR VV/VH) -> convert to composite
        b1 = normalize_band_percentile(data[0], nodata)
        b2 = normalize_band_percentile(data[1], nodata)
        b3 = ((b1.astype(np.float32) + b2.astype(np.float32)) / 2).astype(np.uint8)
        rgb = np.stack([b1, b2, b3], axis=-1)
        img = Image.fromarray(rgb, mode="RGB")
    elif num_bands >= 3:
        # Multi-band / Optical (Use bands 1, 2, 3 as RGB or standard 3-band)
        r = normalize_band_percentile(data[0], nodata)
        g = normalize_band_percentile(data[1], nodata)
        b = normalize_band_percentile(data[2], nodata)
        rgb = np.stack([r, g, b], axis=-1)
        img = Image.fromarray(rgb, mode="RGB")
    else:
        raise ValueError(f"Raster has invalid band count: {num_bands}")

    img.save(out_path, format="PNG", optimize=True)
    logger.info(f"Generated preview PNG at: {out_path} ({img.size[0]}x{img.size[1]})")
    return out_path
