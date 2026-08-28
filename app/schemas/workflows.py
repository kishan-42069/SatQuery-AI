# Pydantic schemas for specialist workflow results (VQA, Grounding, etc.).
from __future__ import annotations

from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, Field


class WorkflowType(str, Enum):
    vqa = "vqa"
    captioning = "captioning"
    grounding = "grounding"
    change_detection = "change_detection"
    sar_fusion = "sar_fusion"


class BoundingBox(BaseModel):
    x_min: float
    y_min: float
    x_max: float
    y_max: float
    crs: Optional[str] = None


class FindingResponse(BaseModel):
    finding_id: str
    workflow: WorkflowType
    label: Optional[str] = None
    answer: Optional[str] = None
    confidence: float = Field(..., ge=0.0, le=1.0)
    bounding_boxes: Optional[list[BoundingBox]] = None
    change_classes: Optional[list[str]] = None
    evidence_refs: list[str] = Field(default_factory=list)
    metadata: Optional[dict[str, Any]] = None


class WorkflowResultResponse(BaseModel):
    run_id: str
    query_id: str
    workflow: WorkflowType
    status: str
    findings: list[FindingResponse]
    trace: list[dict] = Field(default_factory=list, description="Machine-readable agent execution trace")
    error: Optional[str] = None
    duration_ms: Optional[float] = None
