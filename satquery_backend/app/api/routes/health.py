"""
Health and Diagnostic Endpoints for SatQuery AI.
"""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_vision_client
from app.ai.gemini_client import GeminiVisionClient
from app.core.config import settings
from app.db.database import DB_AVAILABLE, get_db_session

router = APIRouter(prefix="/health", tags=["Health & Status"])


@router.get("")
async def health_check(
    vision_client: GeminiVisionClient = Depends(get_vision_client),
    db: AsyncSession = Depends(get_db_session)
):
    """
    Comprehensive system health check including Gemini VLM and database status.
    """
    return {
        "status": "online",
        "project": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "problem_statement": settings.PROBLEM_STATEMENT,
        "environment": settings.ENVIRONMENT,
        "gemini_vlm": {
            "configured": bool(settings.GEMINI_API_KEY),
            "model": settings.GEMINI_MODEL,
            "mode": "online" if vision_client.is_online else "offline_heuristic_fallback"
        },
        "geospatial_engine": {
            "rasterio": True,
            "target_crs": settings.TARGET_CRS
        },
        "database": {
            "available": DB_AVAILABLE,
            "engine": "sqlite" if "sqlite" in settings.DATABASE_URL else "postgresql"
        }
    }
