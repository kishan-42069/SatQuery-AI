"""
Generates synthetic multi-temporal GeoTIFF sample pairs for testing SatQuery AI demonstration workflow.
"""

from pathlib import Path
import numpy as np
import rasterio
from rasterio.transform import from_bounds

def generate_samples():
    out_dir = Path("sample_data")
    out_dir.mkdir(parents=True, exist_ok=True)
    
    width, height = 512, 512
    # Area around Hyderabad / ISRO NRSC (UTM Zone 43N)
    min_x, min_y = 200000.0, 1900000.0
    max_x, max_y = 205120.0, 1905120.0
    transform = from_bounds(min_x, min_y, max_x, max_y, width, height)

    # 1. 2022 Optical Acquisition (Natural Terrain / Agriculture)
    np.random.seed(100)
    b1_2022 = np.random.randint(60, 100, (height, width), dtype=np.uint16)
    b2_2022 = np.random.randint(140, 220, (height, width), dtype=np.uint16) # High NIR/Green
    b3_2022 = np.random.randint(40, 90, (height, width), dtype=np.uint16)
    data_2022 = np.stack([b1_2022, b2_2022, b3_2022])

    p_2022 = out_dir / "isro_optical_2022.tif"
    with rasterio.open(
        p_2022, "w", driver="GTiff", height=height, width=width, count=3,
        dtype=rasterio.uint16, crs="EPSG:32643", transform=transform
    ) as dst:
        dst.write(data_2022)
    print(f"Created: {p_2022} ({width}x{height}, EPSG:32643)")

    # 2. 2026 Optical Acquisition (Urban Growth in North-East Sector)
    data_2026 = data_2022.copy()
    # Add new built-up area (rows 40 to 180, cols 280 to 460)
    data_2026[0, 40:180, 280:460] = 3200
    data_2026[1, 40:180, 280:460] = 3350
    data_2026[2, 40:180, 280:460] = 3400

    # Add new road/infrastructure corridor
    data_2026[:, 180:450, 360:375] = 2800

    p_2026 = out_dir / "isro_optical_2026.tif"
    with rasterio.open(
        p_2026, "w", driver="GTiff", height=height, width=width, count=3,
        dtype=rasterio.uint16, crs="EPSG:32643", transform=transform
    ) as dst:
        dst.write(data_2026)
    print(f"Created: {p_2026} ({width}x{height}, EPSG:32643)")

    # 3. 2026 SAR Acquisition (Dual-band VV/VH)
    sar_vv = np.random.randint(200, 600, (height, width), dtype=np.uint16)
    sar_vh = np.random.randint(100, 400, (height, width), dtype=np.uint16)
    sar_vv[40:180, 280:460] = 2500 # High double-bounce backscatter for buildings
    data_sar = np.stack([sar_vv, sar_vh])

    p_sar = out_dir / "isro_sar_2026.tif"
    with rasterio.open(
        p_sar, "w", driver="GTiff", height=height, width=width, count=2,
        dtype=rasterio.uint16, crs="EPSG:32643", transform=transform
    ) as dst:
        dst.write(data_sar)
    print(f"Created: {p_sar} ({width}x{height}, 2-band SAR)")

if __name__ == "__main__":
    generate_samples()
