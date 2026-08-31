"""
Main multi-modal analysis and orchestration endpoints.
"""

import json
import time
import uuid
from pathlib import Path
from typing import Optional
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.orchestrator import OrchestratorAgent
from app.agents.schemas import AnalysisResponse
from app.api.dependencies import get_orchestrator
from app.core.config import settings
from app.core.logging_config import logger
from app.core.security import sanitize_filename, validate_query, validate_uploaded_file
from app.db.crud import get_analysis_job, get_image_asset, save_analysis_job, save_image_asset
from app.db.database import get_db_session
from app.geospatial.preview_generator import generate_rgb_preview
from app.geospatial.raster_handler import extract_raster_metadata

router = APIRouter(prefix="/analyze", tags=["Multimodal Analysis"])


@router.post("", response_model=AnalysisResponse)
async def analyze_satellite_imagery(
    query: str = Form(...),
    image_1: Optional[UploadFile] = File(None),
    image_2: Optional[UploadFile] = File(None),
    image_1_id: Optional[str] = Form(None),
    image_2_id: Optional[str] = Form(None),
    session_id: str = Form("demo_session"),
    orchestrator: OrchestratorAgent = Depends(get_orchestrator),
    db: AsyncSession = Depends(get_db_session),
):
    """
    Main SatQuery AI Demonstration Endpoint.
    Accepts 1 or 2 GeoTIFF images + a natural-language query.
    Executes Orchestrator -> Specialist Agents -> Gemini VLM -> Geospatial Coordinate Mapping -> Report Agent.
    """
    clean_query = validate_query(query)
    job_id = f"job_{uuid.uuid4().hex[:10]}"
    start_time = time.time()

    logger.info(f"[{job_id}] Received analysis request with query: '{clean_query}'")

    img1_path: Optional[Path] = None
    img1_preview: Optional[Path] = None
    img1_meta: Optional[dict] = None
    img1_asset_id: str = image_1_id or f"ast_{uuid.uuid4().hex[:8]}"

    img2_path: Optional[Path] = None
    img2_preview: Optional[Path] = None
    img2_meta: Optional[dict] = None
    img2_asset_id: Optional[str] = image_2_id

    # 1. Process Image 1
    if image_1:
        content1, safe_fn1 = await validate_uploaded_file(image_1, settings.MAX_UPLOAD_SIZE)
        img1_path = settings.uploads_dir / f"{img1_asset_id}_{safe_fn1}"
        with open(img1_path, "wb") as f:
            f.write(content1)
        meta1_obj = extract_raster_metadata(img1_path)
        img1_meta = meta1_obj.to_dict()
        img1_preview = settings.previews_dir / f"{img1_asset_id}.png"
        generate_rgb_preview(img1_path, img1_preview, nodata=meta1_obj.nodata)
        await save_image_asset(db, img1_asset_id, safe_fn1, str(img1_path), str(img1_preview), img1_meta, session_id)
    elif image_1_id:
        asset1 = await get_image_asset(db, image_1_id)
        if not asset1:
            raise HTTPException(status_code=404, detail=f"Image asset {image_1_id} not found.")
        img1_path = Path(asset1.file_path)
        img1_preview = Path(asset1.preview_path)
        meta1_obj = extract_raster_metadata(img1_path)
        img1_meta = meta1_obj.to_dict()
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least one GeoTIFF image (image_1 or image_1_id) must be provided."
        )

    # 2. Process Image 2 (if present)
    if image_2:
        img2_asset_id = img2_asset_id or f"ast_{uuid.uuid4().hex[:8]}"
        content2, safe_fn2 = await validate_uploaded_file(image_2, settings.MAX_UPLOAD_SIZE)
        img2_path = settings.uploads_dir / f"{img2_asset_id}_{safe_fn2}"
        with open(img2_path, "wb") as f:
            f.write(content2)
        meta2_obj = extract_raster_metadata(img2_path)
        img2_meta = meta2_obj.to_dict()
        img2_preview = settings.previews_dir / f"{img2_asset_id}.png"
        generate_rgb_preview(img2_path, img2_preview, nodata=meta2_obj.nodata)
        await save_image_asset(db, img2_asset_id, safe_fn2, str(img2_path), str(img2_preview), img2_meta, session_id)
    elif image_2_id:
        asset2 = await get_image_asset(db, image_2_id)
        if asset2:
            img2_path = Path(asset2.file_path)
            img2_preview = Path(asset2.preview_path)
            meta2_obj = extract_raster_metadata(img2_path)
            img2_meta = meta2_obj.to_dict()

    # 3. Execute Orchestrator Pipeline
    try:
        response: AnalysisResponse = await orchestrator.run_pipeline(
            query=clean_query,
            image_1_preview_path=str(img1_preview),
            image_1_metadata=img1_meta,
            image_2_preview_path=str(img2_preview) if img2_preview else None,
            image_2_metadata=img2_meta,
            job_id=job_id,
        )

        duration = round((time.time() - start_time) * 1000, 2)

        # 4. Save to Database
        await save_analysis_job(
            db=db,
            job_id=job_id,
            query=clean_query,
            workflow=response.orchestrator_plan.workflow,
            image_1_id=img1_asset_id,
            image_2_id=img2_asset_id,
            result_dict=response.model_dump(),
            session_id=session_id,
            duration_ms=duration,
        )

        return response

    except Exception as e:
        logger.error(f"[{job_id}] Pipeline execution failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Analysis pipeline error: {str(e)}"
        )


@router.get("/jobs/{job_id}")
async def get_job_status(
    job_id: str,
    db: AsyncSession = Depends(get_db_session)
):
    """
    Retrieves stored analysis results for a given job ID.
    """
    job = await get_analysis_job(db, job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found.")

    res_json = json.loads(job.result_json) if job.result_json else {}
    return {
        "job_id": job.job_id,
        "status": job.status,
        "query": job.query,
        "workflow": job.workflow,
        "duration_ms": job.duration_ms,
        "created_at": str(job.created_at),
        "result": res_json,
    }
