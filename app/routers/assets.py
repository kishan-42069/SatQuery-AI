import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, File, HTTPException, Query, UploadFile, status, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.logger import get_logger
from app.core.storage import get_storage
from app.middleware.security import validate_image_format, validate_upload_size
from app.schemas.assets import AssetListResponse, AssetMetadataResponse, AssetUploadResponse, ImageModality
from app.core.database import get_db
from app.models.image_asset import ImageAsset

router = APIRouter(prefix="/assets", tags=["Asset Management"])
logger = get_logger("router.assets")


def _detect_modality(filename: str, metadata: dict) -> ImageModality:
    """Infers image modality from filename/metadata heuristics."""
    name = filename.lower()
    if any(k in name for k in ("sar", "sentinel-1", "s1", "ers", "radarsat")):
        return ImageModality.sar
    if any(k in name for k in ("wv", "pleiades", "spot", "rgb")):
        return ImageModality.optical
    return ImageModality.unknown


def _extract_geospatial_metadata(file_bytes: bytes, filename: str) -> dict:
    """
    Extracts CRS, bounding box, acquisition time, width, height, band count.
    """
    try:
        import io
        import rasterio

        with rasterio.open(io.BytesIO(file_bytes)) as src:
            bounds = src.bounds
            return {
                "crs": src.crs.to_string() if src.crs else None,
                "bbox": [bounds.left, bounds.bottom, bounds.right, bounds.top],
                "width": src.width,
                "height": src.height,
                "band_count": src.count,
                "acquisition_time": None,  # Parse from filename/tags if available
            }
    except Exception as exc:
        logger.warning("metadata_extraction_failed", filename=filename, error=str(exc))
        return {"crs": None, "bbox": None, "width": None, "height": None, "band_count": None, "acquisition_time": None}


@router.post(
    "/upload",
    response_model=AssetUploadResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Upload a satellite image asset (FR-001)",
)
async def upload_asset(file: UploadFile = File(...), db: AsyncSession = Depends(get_db)):
    """Accepts a satellite image, validates it, extracts metadata, and stores it."""
    validate_image_format(file.filename or "unknown.bin")
    file_bytes = await file.read()
    validate_upload_size(len(file_bytes))

    asset_id = uuid.uuid4().hex
    storage = get_storage()
    storage_path = storage.save_upload(file_bytes, file.filename or f"{asset_id}.tif")

    geo_meta = _extract_geospatial_metadata(file_bytes, file.filename or "")
    modality = _detect_modality(file.filename or "", geo_meta)
    
    # Convert bbox list to PostGIS WKT Polygon
    bbox_wkt = None
    bbox_list = geo_meta.get("bbox")
    if bbox_list and len(bbox_list) == 4:
        minx, miny, maxx, maxy = bbox_list
        bbox_wkt = f"POLYGON(({minx} {miny}, {maxx} {miny}, {maxx} {maxy}, {minx} {maxy}, {minx} {miny}))"

    asset = ImageAsset(
        asset_id=asset_id,
        uri=str(storage_path),
        modality=modality,
        crs=geo_meta.get("crs"),
        bbox=bbox_wkt,
        acquisition_time=geo_meta.get("acquisition_time")
    )
    
    db.add(asset)
    await db.commit()
    await db.refresh(asset)

    logger.info("asset_uploaded", asset_id=asset_id, modality=modality.value, size_bytes=len(file_bytes))

    # To maintain response shape, map model back to expected response
    return AssetUploadResponse(
        asset_id=asset.asset_id,
        filename=file.filename or "unknown.bin",
        modality=asset.modality,
        file_size_bytes=len(file_bytes),
        storage_path=asset.uri,
        created_at=asset.created_at,
        crs=geo_meta.get("crs"),
        bbox=bbox_list,
        width=geo_meta.get("width"),
        height=geo_meta.get("height"),
        band_count=geo_meta.get("band_count"),
        acquisition_time=geo_meta.get("acquisition_time")
    )


@router.get(
    "/{asset_id}",
    response_model=AssetMetadataResponse,
    summary="Get metadata for a specific asset (FR-002)",
)
async def get_asset(asset_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ImageAsset).where(ImageAsset.asset_id == asset_id))
    asset = result.scalars().first()
    if not asset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Asset '{asset_id}' not found.")
    
    # Normally we'd extract bbox coordinates from PostGIS, but for simplicity here we return basic schema
    return AssetMetadataResponse(
        asset_id=asset.asset_id,
        filename=asset.uri.split('/')[-1],  # mock from URI
        modality=asset.modality,
        file_size_bytes=0, # mock as we don't store it in db yet
        storage_path=asset.uri,
        created_at=asset.created_at,
        crs=asset.crs,
        bbox=None, # To parse PostGIS we'd need func.ST_AsGeoJSON etc. Mocking for now.
        width=0,
        height=0,
        band_count=0,
        acquisition_time=asset.acquisition_time
    )


@router.get(
    "/",
    response_model=AssetListResponse,
    summary="List all ingested assets",
)
async def list_assets(skip: int = Query(0, ge=0), limit: int = Query(20, ge=1, le=100), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ImageAsset).offset(skip).limit(limit))
    assets = result.scalars().all()
    
    count_result = await db.execute(select(ImageAsset)) # Simplified count for MVP
    total = len(count_result.scalars().all())

    items = []
    for asset in assets:
        items.append(AssetMetadataResponse(
            asset_id=asset.asset_id,
            filename=asset.uri.split('/')[-1],
            modality=asset.modality,
            file_size_bytes=0,
            storage_path=asset.uri,
            created_at=asset.created_at,
            crs=asset.crs,
            bbox=None,
            width=0,
            height=0,
            band_count=0,
            acquisition_time=asset.acquisition_time
        ))
        
    return AssetListResponse(assets=items, total=total)


@router.delete(
    "/{asset_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete an asset",
)
async def delete_asset(asset_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ImageAsset).where(ImageAsset.asset_id == asset_id))
    asset = result.scalars().first()
    if not asset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Asset '{asset_id}' not found.")
    
    storage = get_storage()
    try:
        storage.delete(asset.uri)
    except Exception as exc:
        logger.warning("asset_file_delete_failed", asset_id=asset_id, error=str(exc))
        
    await db.delete(asset)
    await db.commit()
    logger.info("asset_deleted", asset_id=asset_id)
