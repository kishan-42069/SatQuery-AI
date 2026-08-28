# Security middleware: input validation, prompt injection defense, path traversal guard.
from __future__ import annotations

import re
from pathlib import Path

from fastapi import HTTPException, Request, status
from starlette.middleware.base import BaseHTTPMiddleware

from app.core.config import get_settings
from app.core.logger import get_logger

settings = get_settings()
logger = get_logger("security")

# ── PROMPT INJECTION PATTERNS ──────────────────────────────────────────────────
# Known injection triggers to sanitize from natural-language input before
# sending to the agent orchestrator. Expand this list as new patterns emerge.
_INJECTION_PATTERNS: list[re.Pattern] = [
    re.compile(r"ignore previous instructions", re.IGNORECASE),
    re.compile(r"you are now", re.IGNORECASE),
    re.compile(r"disregard (all|your|the)", re.IGNORECASE),
    re.compile(r"system prompt", re.IGNORECASE),
    re.compile(r"jailbreak", re.IGNORECASE),
    re.compile(r"<\|.*?\|>"),           # Token injection patterns
    re.compile(r"\[INST\]|\[/INST\]"),  # LLaMA instruction markers
]

_APPROVED_UPLOAD_DIRS = frozenset(["data/raw", "data/derived", "data/tiles", "data/reports"])
_MAX_QUERY_LENGTH = 4096


def sanitize_query(text: str) -> str:
    """Strips prompt injection patterns from user natural-language input."""
    sanitized = text
    for pattern in _INJECTION_PATTERNS:
        sanitized = pattern.sub("[REDACTED]", sanitized)
    if sanitized != text:
        logger.warning("prompt_injection_detected", original_length=len(text))
    return sanitized


def validate_file_path(path: str | Path) -> Path:
    """Ensures file path stays within approved storage directories."""
    p = Path(path)
    for approved in _APPROVED_UPLOAD_DIRS:
        try:
            p.relative_to(Path(settings.storage_local_root) / approved.split("/", 1)[-1])
            return p
        except ValueError:
            continue
    # Check if within storage root at all
    try:
        p.resolve().relative_to(Path(settings.storage_local_root).resolve())
        return p
    except ValueError:
        raise ValueError(f"Path traversal blocked: '{path}' is outside the approved storage root.")


def validate_upload_size(size_bytes: int) -> None:
    """Raises HTTP 413 if the upload exceeds the configured max size."""
    max_bytes = settings.max_upload_size_mb * 1024 * 1024
    if size_bytes > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds maximum allowed size of {settings.max_upload_size_mb} MB.",
        )


def validate_image_format(filename: str) -> str:
    """Returns the file extension or raises HTTP 415 for unsupported formats."""
    ext = Path(filename).suffix.lstrip(".").lower()
    if ext not in settings.allowed_image_formats:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Unsupported format '.{ext}'. Allowed: {settings.allowed_image_formats}",
        )
    return ext


class SecurityMiddleware(BaseHTTPMiddleware):
    """Request-level security middleware applied globally to all routes."""

    async def dispatch(self, request: Request, call_next):
        # Log incoming requests (path only — no body, no sensitive params)
        logger.info("request", method=request.method, path=request.url.path)
        response = await call_next(request)
        logger.info("response", status_code=response.status_code, path=request.url.path)
        return response
