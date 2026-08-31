"""
Security and validation utilities for SatQuery AI.
"""

import re
import uuid
from pathlib import Path
from typing import Tuple
from fastapi import HTTPException, UploadFile, status

# Standard TIFF magic numbers
TIFF_LITTLE_ENDIAN = b"II\x2a\x00"
TIFF_BIG_ENDIAN = b"MM\x00\x2a"
BIGTIFF_LITTLE_ENDIAN = b"II\x2b\x00"
BIGTIFF_BIG_ENDIAN = b"MM\x00\x2b"

VALID_TIFF_HEADERS = [
    TIFF_LITTLE_ENDIAN,
    TIFF_BIG_ENDIAN,
    BIGTIFF_LITTLE_ENDIAN,
    BIGTIFF_BIG_ENDIAN,
]


def sanitize_filename(filename: str) -> str:
    """
    Sanitizes user-provided filename to avoid path traversal and unsafe characters.
    """
    if not filename:
        return f"raster_{uuid.uuid4().hex[:8]}.tif"
    # Strip directory paths
    base_name = Path(filename).name
    # Keep only alphanumeric, dash, underscore, dot
    clean_name = re.sub(r"[^a-zA-Z0-9_\-\.]", "_", base_name)
    if not clean_name.lower().endswith((".tif", ".tiff")):
        clean_name += ".tif"
    return clean_name


def validate_tiff_header(header_bytes: bytes) -> bool:
    """
    Validates if the header bytes match standard TIFF/GeoTIFF format.
    """
    if len(header_bytes) < 4:
        return False
    return any(header_bytes.startswith(magic) for magic in VALID_TIFF_HEADERS)


async def validate_uploaded_file(
    file: UploadFile, max_size_bytes: int
) -> Tuple[bytes, str]:
    """
    Validates an uploaded file for size, format, and magic bytes.
    Returns the file content and sanitized filename.
    """
    filename = sanitize_filename(file.filename or "upload.tif")
    content = await file.read()

    if len(content) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Uploaded file '{filename}' is empty."
        )

    if len(content) > max_size_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File '{filename}' exceeds maximum allowed size of {max_size_bytes // (1024*1024)}MB."
        )

    if not validate_tiff_header(content[:8]):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File '{filename}' is not a valid GeoTIFF / TIFF raster."
        )

    return content, filename


def validate_query(query: str) -> str:
    """
    Validates and trims user natural language query.
    """
    if not query or not query.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Query string cannot be empty."
        )
    trimmed = query.strip()
    if len(trimmed) > 2000:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Query length exceeds maximum limit of 2000 characters."
        )
    return trimmed
