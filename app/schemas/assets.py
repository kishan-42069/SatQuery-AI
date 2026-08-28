# Pydantic request/response schemas for asset management.
from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class ImageModality(str, Enum):
    optical = "optical"
    sar = "sar"
    multispectral = "multispectral"
    hyperspectral = "hyperspectral"
    unknown = "unknown"


class AssetUploadResponse(BaseModel):
    asset_id: str
    filename: str
    modality: ImageModality
    file_size_bytes: int
    storage_path: str
    crs: Optional[str] = None
    bbox: Optional[list[float]] = Field(None, description="[minx, miny, maxx, maxy] in CRS units")
    acquisition_time: Optional[datetime] = None
    width: Optional[int] = None
    height: Optional[int] = None
    band_count: Optional[int] = None
    message: str = "Asset ingested successfully."


class AssetMetadataResponse(BaseModel):
    asset_id: str
    filename: str
    modality: ImageModality
    crs: Optional[str]
    bbox: Optional[list[float]]
    acquisition_time: Optional[datetime]
    width: Optional[int]
    height: Optional[int]
    band_count: Optional[int]
    storage_path: str
    created_at: datetime


class AssetListResponse(BaseModel):
    assets: list[AssetMetadataResponse]
    total: int
