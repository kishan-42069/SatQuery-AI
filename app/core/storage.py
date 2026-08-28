# File storage abstraction: local filesystem for MVP, S3-compatible for production.
# ⚠️  IMPORTANT — STORAGE NOTE:
# For MVP all files are stored on the LOCAL FILESYSTEM under STORAGE_LOCAL_ROOT (./data).
# Raw imagery goes to data/raw/, derived products to data/derived/, reports to data/reports/.
# When moving to production, set STORAGE_BACKEND=s3 in .env and implement the S3Backend below.

import shutil
import uuid
from pathlib import Path

from app.core.config import get_settings

settings = get_settings()


class LocalStorageBackend:
    """Stores files on the local filesystem under STORAGE_LOCAL_ROOT."""

    def __init__(self, root: str) -> None:
        self.root = Path(root)
        for subdir in ("raw", "derived", "tiles", "reports", "tmp"):
            (self.root / subdir).mkdir(parents=True, exist_ok=True)

    def save_upload(self, file_bytes: bytes, original_filename: str, subdir: str = "raw") -> Path:
        """Saves an uploaded file and returns its absolute path."""
        # ── DATASET INJECTION POINT ──────────────────────────────────────────
        # The user will manually drop raw satellite imagery here.
        # Expected input: GeoTIFF (.tif/.tiff), JPEG2000 (.jp2), SAR (.img), NetCDF (.nc)
        # Drop the file at: data/raw/<your_filename>
        # This function also accepts programmatic uploads from the /assets endpoint.
        # ─────────────────────────────────────────────────────────────────────
        ext = Path(original_filename).suffix
        unique_name = f"{uuid.uuid4().hex}{ext}"
        dest = self.root / subdir / unique_name
        dest.write_bytes(file_bytes)
        return dest

    def get_path(self, relative: str) -> Path:
        """Resolves a relative path safely within the storage root (prevents traversal)."""
        resolved = (self.root / relative).resolve()
        if not str(resolved).startswith(str(self.root.resolve())):
            raise ValueError(f"Path traversal attempt blocked: {relative}")
        return resolved

    def delete(self, relative: str) -> None:
        path = self.get_path(relative)
        if path.exists():
            path.unlink()

    def save_derived(self, file_bytes: bytes, filename: str) -> Path:
        """Saves a derived product (tiles, change maps, etc.) separately from originals."""
        dest = self.root / "derived" / filename
        dest.write_bytes(file_bytes)
        return dest


# ── MODEL INJECTION POINT ──────────────────────────────────────────────────────
# If storing model weights locally, place them under data/weights/.
# Example: data/weights/blip2-opt-2.7b/ or data/weights/llava-1.5-7b/
# Ensure STORAGE_LOCAL_ROOT points to the correct base path.
# ──────────────────────────────────────────────────────────────────────────────


def get_storage() -> LocalStorageBackend:
    """Returns the active storage backend (local for MVP)."""
    if settings.storage_backend == "local":
        return LocalStorageBackend(root=settings.storage_local_root)
    # S3 backend: implement S3StorageBackend and return here when STORAGE_BACKEND=s3
    raise NotImplementedError("S3 storage backend not yet implemented. Set STORAGE_BACKEND=local for MVP.")
