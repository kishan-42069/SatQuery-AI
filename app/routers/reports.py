# Reporting & Export Router: retrieves analysis summaries and generated evidence (FR-010, FR-011, FR-014).
from __future__ import annotations

import uuid
from datetime import datetime

from fastapi import APIRouter, HTTPException, status

from app.core.logger import get_logger
from app.schemas.reports import ExportRequest, ExportResponse, ReportListResponse, ReportResponse

router = APIRouter(prefix="/reports", tags=["Reports & Export"])
logger = get_logger("router.reports")

# In-memory report store for MVP.
_report_store: dict[str, dict] = {}


@router.get(
    "/{report_id}",
    response_model=ReportResponse,
    summary="Retrieve a structured analysis report (FR-010)",
)
async def get_report(report_id: str):
    if report_id not in _report_store:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Report '{report_id}' not found.")
    return ReportResponse(**_report_store[report_id])


@router.get(
    "/session/{session_id}",
    response_model=ReportListResponse,
    summary="List all reports for a session (FR-011)",
)
async def list_reports(session_id: str):
    reports = [r for r in _report_store.values() if r.get("session_id") == session_id]
    return ReportListResponse(reports=[ReportResponse(**r) for r in reports], total=len(reports))


@router.post(
    "/export",
    response_model=ExportResponse,
    summary="Export a report in the requested format (FR-014)",
)
async def export_report(body: ExportRequest):
    if body.report_id not in _report_store:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Report '{body.report_id}' not found.")
    if body.format not in ("json", "pdf", "geojson"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported format. Use: json | pdf | geojson")

    # Placeholder export URI — wire to actual file generation (PDF renderer, GeoJSON serializer) later.
    export_uri = f"/data/reports/{body.report_id}.{body.format}"
    logger.info("report_exported", report_id=body.report_id, format=body.format)
    return ExportResponse(report_id=body.report_id, format=body.format, export_uri=export_uri)


def store_report(run_id: str, session_id: str, summary: str, evidence: list[dict]) -> str:
    """Internal helper called by the Report Agent to persist a final report."""
    report_id = uuid.uuid4().hex
    _report_store[report_id] = {
        "report_id": report_id,
        "run_id": run_id,
        "session_id": session_id,
        "summary": summary,
        "evidence": evidence,
        "export_uri": None,
        "created_at": datetime.utcnow(),
    }
    logger.info("report_stored", report_id=report_id, run_id=run_id)
    return report_id
