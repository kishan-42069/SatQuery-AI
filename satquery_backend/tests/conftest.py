"""
Test fixtures and synthetic GeoTIFF generators for SatQuery AI.
"""

import os
from pathlib import Path
import numpy as np
import pytest
import pytest_asyncio
import rasterio
from rasterio.transform import from_bounds

from app.db.database import init_db


@pytest_asyncio.fixture(scope="session", autouse=True)
async def setup_test_database():
    """Initializes the database schema for the test session."""
    await init_db()


@pytest.fixture(scope="session")
def test_data_dir(tmp_path_factory) -> Path:
    d = tmp_path_factory.mktemp("geotiff_fixtures")
    return d


@pytest.fixture(scope="session")
def sample_geotiff_pair(test_data_dir: Path):
    """
    Creates two synthetic 3-band GeoTIFFs (Before and After)
    with UTM CRS (EPSG:32643) covering an area in India (e.g. Hyderabad / ISRO NRSC area).
    """
    width, height = 256, 256
    # EPSG:32643 (UTM Zone 43N) coordinates
    min_x, min_y = 200000.0, 1900000.0
    max_x, max_y = 202560.0, 1902560.0
    transform = from_bounds(min_x, min_y, max_x, max_y, width, height)

    # Base Image 1 (Before - Natural terrain / green vegetation)
    img1_path = test_data_dir / "sample_before_2022.tif"
    np.random.seed(42)
    band1 = np.random.randint(40, 80, (height, width), dtype=np.uint16)
    band2 = np.random.randint(120, 200, (height, width), dtype=np.uint16)  # High green
    band3 = np.random.randint(30, 70, (height, width), dtype=np.uint16)
    data1 = np.stack([band1, band2, band3])

    with rasterio.open(
        img1_path,
        "w",
        driver="GTiff",
        height=height,
        width=width,
        count=3,
        dtype=rasterio.uint16,
        crs="EPSG:32643",
        transform=transform,
    ) as dst:
        dst.write(data1)

    # Base Image 2 (After - Urban development added in North-East quadrant)
    img2_path = test_data_dir / "sample_after_2026.tif"
    data2 = data1.copy()
    # Introduce intense urban building reflectance in top-right sector
    data2[0, 20:100, 150:240] = 3000
    data2[1, 20:100, 150:240] = 3100
    data2[2, 20:100, 150:240] = 3200

    with rasterio.open(
        img2_path,
        "w",
        driver="GTiff",
        height=height,
        width=width,
        count=3,
        dtype=rasterio.uint16,
        crs="EPSG:32643",
        transform=transform,
    ) as dst:
        dst.write(data2)

    return img1_path, img2_path
