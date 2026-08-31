"""
Asset ingestion and preview endpoints.
"""

import json
import uuid
from pathlib import Path
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.logging_config import logger
from app.core.security import validate_uploaded_file
from app.db.crud import get_image_asset, save_image_asset
from app.db.database import get_db_session
from app.geospatial.preview_generator import generate_rgb_preview
from app.geospatial.raster_handler import extract_raster_metadata

router = APIRouter(prefix="/assets", tags=["Geospatial Assets"])


@router.post("/upload")
async def upload_geotiff(
    file: UploadFile = File(...),
    session_id: str = Form("default_session"),
    db: AsyncSession = Depends(get_db_session),
):
    """
    Ingests a GeoTIFF, validates format, extracts geospatial metadata,
    and generates an RGB preview.
    """
    content, safe_filename = await validate_uploaded_file(file, settings.MAX_UPLOAD_SIZE)
    asset_id = f"ast_{uuid.uuid4().hex[:10]}"

    dest_file = settings.uploads_dir / f"{asset_id}_{safe_filename}"
    with open(dest_file, "wb") as f:
        f.write(content)

    # Extract metadata via rasterio
    try:
        meta = extract_raster_metadata(dest_file)
        meta_dict = meta.to_dict()
    except Exception as e:
        logger.error(f"Failed to extract GeoTIFF metadata from {dest_file}: {e}")
        if dest_file.exists():
            dest_file.unlink()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to parse GeoTIFF raster: {str(e)}"
        )

    # Generate RGB preview
    preview_file = settings.previews_dir / f"{asset_id}.png"
    try:
        generate_rgb_preview(dest_file, preview_file, nodata=meta.nodata)
    except Exception as e:
        logger.warning(f"Preview generation warning: {e}")

    # Persist in DB
    await save_image_asset(
        db=db,
        asset_id=asset_id,
        filename=safe_filename,
        file_path=str(dest_file),
        preview_path=str(preview_file),
        meta_dict=meta_dict,
        session_id=session_id,
    )

    return {
        "status": "success",
        "asset_id": asset_id,
        "filename": safe_filename,
        "preview_url": f"/api/v1/assets/{asset_id}/preview",
        "metadata": meta_dict,
    }


@router.get("/{asset_id}")
async def get_asset_metadata(
    asset_id: str,
    db: AsyncSession = Depends(get_db_session)
):
    """
    Retrieves metadata for a specific GeoTIFF asset.
    """
    asset = await get_image_asset(db, asset_id)
    if not asset:
        raise HTTPException(status_code=404, detail=f"Asset {asset_id} not found.")

    return {
        "asset_id": asset.asset_id,
        "filename": asset.filename,
        "preview_url": f"/api/v1/assets/{asset_id}/preview",
        "dimensions": {"width": asset.width, "height": asset.height, "bands": asset.band_count},
        "crs": {"epsg": asset.crs_epsg, "wkt": asset.crs_wkt},
        "native_bounds": json.loads(asset.bounds_json) if asset.bounds_json else {},
        "wgs84_bounds": json.loads(asset.wgs84_bounds_json) if asset.wgs84_bounds_json else {},
    }


@router.get("/{asset_id}/preview")
async def get_asset_preview(
    asset_id: str,
    db: AsyncSession = Depends(get_db_session)
):
    """
    Streams the converted RGB PNG preview of the GeoTIFF asset.
    """
    preview_file = settings.previews_dir / f"{asset_id}.png"
    if not preview_file.exists():
        # Check if asset exists and try to regenerate preview
        asset = await get_image_asset(db, asset_id)
        if asset and Path(asset.file_path).exists():
            generate_rgb_preview(asset.file_path, preview_file)
        else:
            raise HTTPException(status_code=404, detail="Preview not found.")

    return FileResponse(preview_file, media_type="image/png")
