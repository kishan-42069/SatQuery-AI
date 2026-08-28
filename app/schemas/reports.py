# Pydantic schemas for report generation and export.
from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel


class ReportResponse(BaseModel):
    report_id: str
    run_id: str
    session_id: str
    summary: str
    evidence: list[dict[str, Any]]
    export_uri: Optional[str] = None
    created_at: datetime


class ReportListResponse(BaseModel):
    reports: list[ReportResponse]
    total: int


class ExportRequest(BaseModel):
    report_id: str
    format: str = "json"  # Options: json | pdf | geojson


class ExportResponse(BaseModel):
    report_id: str
    format: str
    export_uri: str
    message: str = "Export ready."
