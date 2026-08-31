"""
Unit tests for GeoTIFF metadata extraction and Coordinate Transformation.
"""

from pathlib import Path
from app.geospatial.coordinate_transform import CoordinateTransformer
from app.geospatial.preview_generator import generate_rgb_preview
from app.geospatial.raster_handler import extract_raster_metadata


def test_extract_raster_metadata(sample_geotiff_pair):
    img1_path, _ = sample_geotiff_pair
    meta = extract_raster_metadata(img1_path)

    assert meta.width == 256
    assert meta.height == 256
    assert meta.count == 3
    assert meta.crs_epsg == 32643
    assert len(meta.transform) == 6
    assert "left" in meta.bounds
    assert "min_lon" in meta.wgs84_bounds
    assert "min_lat" in meta.wgs84_bounds


def test_generate_rgb_preview(sample_geotiff_pair, tmp_path):
    img1_path, _ = sample_geotiff_pair
    preview_path = tmp_path / "test_preview.png"
    out = generate_rgb_preview(img1_path, preview_path)

    assert out.exists()
    assert out.stat().st_size > 0


def test_coordinate_transformer(sample_geotiff_pair):
    img1_path, _ = sample_geotiff_pair
    meta = extract_raster_metadata(img1_path)

    transformer = CoordinateTransformer(
        width=meta.width,
        height=meta.height,
        affine_transform=meta.transform,
        crs_str=meta.crs_str,
        crs_epsg=meta.crs_epsg,
    )

    assert transformer.is_georeferenced is True

    # Test top-left pixel (0, 0)
    native_x, native_y = transformer.pixel_to_native(0, 0)
    assert round(native_x) == round(meta.bounds["left"])
    assert round(native_y) == round(meta.bounds["top"])

    # Test Box to GeoJSON Polygon
    box = [50, 50, 150, 150]  # ymin, xmin, ymax, xmax
    geojson_feat = transformer.transform_box_to_geojson(box, label="Urban Area", confidence=0.95)

    assert geojson_feat["type"] == "Feature"
    assert geojson_feat["geometry"]["type"] == "Polygon"
    coords = geojson_feat["geometry"]["coordinates"][0]
    assert len(coords) == 5  # Closed ring
    assert coords[0] == coords[-1]  # Closed polygon check

    # Verify WGS84 coordinates are valid longitudes/latitudes
    for lon, lat in coords:
        assert -180.0 <= lon <= 180.0
        assert -90.0 <= lat <= 90.0


def test_non_georeferenced_raster(tmp_path):
    """Verifies that non-georeferenced TIFFs are handled without crashing."""
    import numpy as np
    import rasterio

    tiff_path = tmp_path / "non_geo.tif"
    data = np.zeros((3, 100, 100), dtype=np.uint8)
    with rasterio.open(
        tiff_path,
        "w",
        driver="GTiff",
        height=100,
        width=100,
        count=3,
        dtype=rasterio.uint8
    ) as dst:
        dst.write(data)

    meta = extract_raster_metadata(tiff_path)
    assert meta.crs_epsg is None

    transformer = CoordinateTransformer(
        width=meta.width,
        height=meta.height,
        affine_transform=meta.transform,
        crs_str=meta.crs_str,
        crs_epsg=meta.crs_epsg,
    )
    assert transformer.is_georeferenced is False
    box_feat = transformer.transform_box_to_geojson([10, 10, 50, 50])
    assert box_feat["properties"]["is_georeferenced"] is False
