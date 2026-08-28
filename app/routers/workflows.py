# Specialist Workflows Router: receives orchestrator results for VQA, Captioning,
# Grounding, Change Detection, and SAR Fusion (FR-005 to FR-009).
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, HTTPException, status

from app.core.logger import get_logger
from app.schemas.workflows import FindingResponse, WorkflowResultResponse, WorkflowType

router = APIRouter(prefix="/workflows", tags=["Specialist Workflows"])
logger = get_logger("router.workflows")

# In-memory run store for MVP.
_run_store: dict[str, dict] = {}


@router.get(
    "/{run_id}",
    response_model=WorkflowResultResponse,
    summary="Get workflow result by run ID (FR-005 to FR-009)",
)
async def get_workflow_result(run_id: str):
    """Returns the structured result of a completed specialist workflow run."""
    if run_id not in _run_store:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Run '{run_id}' not found.")
    return WorkflowResultResponse(**_run_store[run_id])


@router.get(
    "/query/{query_id}",
    response_model=list[WorkflowResultResponse],
    summary="List all workflow runs for a query",
)
async def list_runs_for_query(query_id: str):
    runs = [r for r in _run_store.values() if r.get("query_id") == query_id]
    return [WorkflowResultResponse(**r) for r in runs]


def store_workflow_result(
    query_id: str,
    workflow: WorkflowType,
    findings: list[FindingResponse],
    trace: list[dict],
    duration_ms: Optional[float] = None,
    error: Optional[str] = None,
) -> str:
    """
    Internal helper called by the orchestrator to persist a workflow result.
    Returns the generated run_id.
    """
    run_id = uuid.uuid4().hex
    _run_store[run_id] = {
        "run_id": run_id,
        "query_id": query_id,
        "workflow": workflow,
        "status": "failed" if error else "completed",
        "findings": [f.model_dump() for f in findings],
        "trace": trace,
        "error": error,
        "duration_ms": duration_ms,
    }
    logger.info("workflow_result_stored", run_id=run_id, workflow=workflow.value, error=bool(error))
    return run_id


# ── GRACEFUL FAILURE HANDLERS ─────────────────────────────────────────────────
# Called by the orchestrator when a workflow cannot complete (FR-015).

def handle_unsupported_modality(query_id: str, workflow: WorkflowType, modality: str) -> str:
    """Stores a failed run record for unsupported image modalities."""
    return store_workflow_result(
        query_id=query_id,
        workflow=workflow,
        findings=[],
        trace=[{"step": "modality_check", "result": "unsupported", "modality": modality}],
        error=f"Modality '{modality}' is not supported by the {workflow.value} workflow.",
    )


def handle_low_confidence(query_id: str, workflow: WorkflowType, confidence: float) -> str:
    """Stores a warning run record when model confidence falls below threshold."""
    return store_workflow_result(
        query_id=query_id,
        workflow=workflow,
        findings=[],
        trace=[{"step": "confidence_check", "confidence": confidence, "threshold": 0.4}],
        error=f"Result confidence ({confidence:.2f}) is below acceptable threshold. Result withheld.",
    )
