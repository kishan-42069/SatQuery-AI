# Asset Management Router: image ingestion, format validation, metadata extraction (FR-001, FR-002).
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, File, HTTPException, Query, UploadFile, status

from app.core.logger import get_logger
from app.core.storage import get_storage
from app.middleware.security import validate_image_format, validate_upload_size
from app.schemas.assets import AssetListResponse, AssetMetadataResponse, AssetUploadResponse, ImageModality

router = APIRouter(prefix="/assets", tags=["Asset Management"])
logger = get_logger("router.assets")

# In-memory store for MVP. Replace with DB queries (see app/core/database.py) when ORM models are wired.
_asset_store: dict[str, dict] = {}


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

    ── DATASET INJECTION POINT ──────────────────────────────────────────────
    The user will provide GeoTIFF / JPEG2000 / SAR imagery here manually.
    Expected input: Any raster format supported by rasterio (GeoTIFF preferred).
    Drop the file at: data/raw/<your_filename.tif>
    The /assets/upload endpoint reads the file bytes and extracts metadata here.
    ─────────────────────────────────────────────────────────────────────────
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
async def upload_asset(file: UploadFile = File(...)):
    """Accepts a satellite image, validates it, extracts metadata, and stores it."""
    validate_image_format(file.filename or "unknown.bin")
    file_bytes = await file.read()
    validate_upload_size(len(file_bytes))

    asset_id = uuid.uuid4().hex
    storage = get_storage()
    storage_path = storage.save_upload(file_bytes, file.filename or f"{asset_id}.tif")

    geo_meta = _extract_geospatial_metadata(file_bytes, file.filename or "")
    modality = _detect_modality(file.filename or "", geo_meta)

    record = {
        "asset_id": asset_id,
        "filename": file.filename,
        "modality": modality,
        "file_size_bytes": len(file_bytes),
        "storage_path": str(storage_path),
        "created_at": datetime.utcnow(),
        **geo_meta,
    }
    _asset_store[asset_id] = record
    logger.info("asset_uploaded", asset_id=asset_id, modality=modality.value, size_bytes=len(file_bytes))

    return AssetUploadResponse(**record)


@router.get(
    "/{asset_id}",
    response_model=AssetMetadataResponse,
    summary="Get metadata for a specific asset (FR-002)",
)
async def get_asset(asset_id: str):
    if asset_id not in _asset_store:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Asset '{asset_id}' not found.")
    return AssetMetadataResponse(**_asset_store[asset_id])


@router.get(
    "/",
    response_model=AssetListResponse,
    summary="List all ingested assets",
)
async def list_assets(skip: int = Query(0, ge=0), limit: int = Query(20, ge=1, le=100)):
    assets = list(_asset_store.values())
    paginated = assets[skip : skip + limit]
    return AssetListResponse(
        assets=[AssetMetadataResponse(**a) for a in paginated],
        total=len(assets),
    )


@router.delete(
    "/{asset_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete an asset",
)
async def delete_asset(asset_id: str):
    if asset_id not in _asset_store:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Asset '{asset_id}' not found.")
    record = _asset_store.pop(asset_id)
    storage = get_storage()
    try:
        storage.delete(record["storage_path"])
    except Exception as exc:
        logger.warning("asset_file_delete_failed", asset_id=asset_id, error=str(exc))
    logger.info("asset_deleted", asset_id=asset_id)
