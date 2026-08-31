"""
Asynchronous CRUD operations for SatQuery AI database entities.
"""

import json
from typing import Any, Dict, List, Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging_config import logger
from app.db.models import (
    AnalysisJobModel,
    FindingModel,
    ImageAssetModel,
    ReportModel,
    SessionModel,
)


async def create_or_get_session(db: Optional[AsyncSession], session_id: str) -> Optional[SessionModel]:
    """Ensures a session entity exists."""
    if db is None:
        return None
    try:
        stmt = select(SessionModel).where(SessionModel.session_id == session_id)
        result = await db.execute(stmt)
        sess = result.scalar_one_or_none()
        if not sess:
            sess = SessionModel(session_id=session_id)
            db.add(sess)
            await db.flush()
        return sess
    except Exception as e:
        logger.warning(f"Error creating/fetching session {session_id}: {e}")
        return None


async def save_image_asset(
    db: Optional[AsyncSession],
    asset_id: str,
    filename: str,
    file_path: str,
    preview_path: str,
    meta_dict: Dict[str, Any],
    session_id: Optional[str] = None,
) -> Optional[ImageAssetModel]:
    """Persists a GeoTIFF asset and its extracted metadata."""
    if db is None:
        return None
    try:
        dims = meta_dict.get("dimensions", {})
        crs_info = meta_dict.get("crs", {})
        asset = ImageAssetModel(
            asset_id=asset_id,
            session_id=session_id,
            filename=filename,
            file_path=file_path,
            preview_path=preview_path,
            width=dims.get("width", 0),
            height=dims.get("height", 0),
            band_count=dims.get("bands", 1),
            crs_epsg=crs_info.get("epsg"),
            crs_wkt=crs_info.get("wkt"),
            bounds_json=json.dumps(meta_dict.get("native_bounds", {})),
            wgs84_bounds_json=json.dumps(meta_dict.get("wgs84_bounds", {})),
        )
        db.add(asset)
        await db.flush()
        return asset
    except Exception as e:
        logger.warning(f"Error saving image asset {asset_id} to database: {e}")
        return None


async def get_image_asset(db: Optional[AsyncSession], asset_id: str) -> Optional[ImageAssetModel]:
    """Retrieves an image asset by ID."""
    if db is None:
        return None
    try:
        stmt = select(ImageAssetModel).where(ImageAssetModel.asset_id == asset_id)
        res = await db.execute(stmt)
        return res.scalar_one_or_none()
    except Exception as e:
        logger.warning(f"Error retrieving image asset {asset_id}: {e}")
        return None


async def save_analysis_job(
    db: Optional[AsyncSession],
    job_id: str,
    query: str,
    workflow: str,
    image_1_id: str,
    image_2_id: Optional[str],
    result_dict: Dict[str, Any],
    session_id: Optional[str] = None,
    duration_ms: Optional[float] = None,
) -> Optional[AnalysisJobModel]:
    """Persists an analysis job run and its findings/report."""
    if db is None:
        return None
    try:
        job = AnalysisJobModel(
            job_id=job_id,
            session_id=session_id,
            query=query,
            workflow=workflow,
            status="completed",
            image_1_id=image_1_id,
            image_2_id=image_2_id,
            result_json=json.dumps(result_dict),
            duration_ms=duration_ms,
        )
        db.add(job)
        await db.flush()

        # Save Report
        rep_dict = result_dict.get("report", {})
        if rep_dict:
            rep = ReportModel(
                report_id=f"rep_{job_id}",
                job_id=job_id,
                executive_summary=rep_dict.get("executive_summary", ""),
                key_findings_json=json.dumps(rep_dict.get("key_findings", [])),
                spatial_impact=rep_dict.get("spatial_impact", ""),
                confidence_assessment=rep_dict.get("confidence_assessment", ""),
                recommendations_json=json.dumps(rep_dict.get("recommendations", [])),
            )
            db.add(rep)

        await db.flush()
        return job
    except Exception as e:
        logger.warning(f"Error saving analysis job {job_id}: {e}")
        return None


async def get_analysis_job(db: Optional[AsyncSession], job_id: str) -> Optional[AnalysisJobModel]:
    """Retrieves an analysis job by ID."""
    if db is None:
        return None
    try:
        stmt = select(AnalysisJobModel).where(AnalysisJobModel.job_id == job_id)
        res = await db.execute(stmt)
        return res.scalar_one_or_none()
    except Exception as e:
        logger.warning(f"Error retrieving analysis job {job_id}: {e}")
        return None
