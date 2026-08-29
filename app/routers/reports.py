import uuid
from datetime import datetime

from fastapi import APIRouter, HTTPException, status, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.core.logger import get_logger
from app.schemas.reports import ExportRequest, ExportResponse, ReportListResponse, ReportResponse
from app.core.database import get_db
from app.models.report import Report

router = APIRouter(prefix="/reports", tags=["Reports & Export"])
logger = get_logger("router.reports")


@router.get(
    "/{report_id}",
    response_model=ReportResponse,
    summary="Retrieve a structured analysis report (FR-010)",
)
async def get_report(report_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Report).where(Report.report_id == report_id))
    report = result.scalars().first()
    
    if not report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Report '{report_id}' not found.")
        
    return ReportResponse(
        report_id=report.report_id,
        run_id=report.run_id,
        session_id=report.session_id,
        summary=report.summary,
        evidence=report.evidence,
        export_uri=report.export_uri,
        created_at=report.created_at
    )


@router.get(
    "/session/{session_id}",
    response_model=ReportListResponse,
    summary="List all reports for a session (FR-011)",
)
async def list_reports(session_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Report).where(Report.session_id == session_id))
    reports = result.scalars().all()
    
    count_result = await db.execute(select(func.count(Report.report_id)).where(Report.session_id == session_id))
    total = count_result.scalar_one_or_none() or 0
    
    return ReportListResponse(
        reports=[
            ReportResponse(
                report_id=r.report_id,
                run_id=r.run_id,
                session_id=r.session_id,
                summary=r.summary,
                evidence=r.evidence,
                export_uri=r.export_uri,
                created_at=r.created_at
            ) for r in reports
        ],
        total=total
    )


@router.post(
    "/export",
    response_model=ExportResponse,
    summary="Export a report in the requested format (FR-014)",
)
async def export_report(body: ExportRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Report).where(Report.report_id == body.report_id))
    report = result.scalars().first()
    
    if not report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Report '{body.report_id}' not found.")
    
    if body.format not in ("json", "pdf", "geojson"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported format. Use: json | pdf | geojson")

    # Placeholder export URI — wire to actual file generation (PDF renderer, GeoJSON serializer) later.
    export_uri = f"/data/reports/{body.report_id}.{body.format}"
    
    report.export_uri = export_uri
    await db.commit()
    
    logger.info("report_exported", report_id=body.report_id, format=body.format)
    return ExportResponse(report_id=body.report_id, format=body.format, export_uri=export_uri)


async def store_report(db: AsyncSession, run_id: str, session_id: str, summary: str, evidence: list[dict]) -> str:
    """Internal helper called by the Report Agent to persist a final report."""
    report_id = uuid.uuid4().hex
    
    report = Report(
        report_id=report_id,
        run_id=run_id,
        session_id=session_id,
        summary=summary,
        evidence=evidence
    )
    db.add(report)
    await db.commit()
    
    logger.info("report_stored", report_id=report_id, run_id=run_id)
    return report_id
