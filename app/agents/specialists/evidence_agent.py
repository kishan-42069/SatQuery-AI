# Evidence Agent: checks provenance and composes a traceable evidence chain.
# Links every finding back to its model run and source asset.
from __future__ import annotations

import uuid
from typing import Any

from app.agents.state import AgentState
from app.core.logger import get_logger

logger = get_logger("agents.evidence")


def run(state: AgentState) -> dict[str, Any]:
    """
    Builds a traceable evidence chain from the specialist agent findings.
    Every finding is linked to its source asset and workflow run.
    Never presents uncertainty as certainty (per NFR).
    """
    findings = state.get("findings", [])
    query_id = state.get("query_id", "unknown")
    session_id = state.get("session_id", "unknown")
    uncertainty_flag = state.get("uncertainty_flag", False)

    evidence_records = []
    for finding in findings:
        evidence = {
            "evidence_id": uuid.uuid4().hex,
            "finding_id": finding.get("finding_id"),
            "workflow": finding.get("workflow"),
            "source_asset_ids": finding.get("evidence_refs", []),
            "confidence": finding.get("confidence", 0.0),
            "uncertainty_flagged": uncertainty_flag,
            "query_id": query_id,
            "session_id": session_id,
            "provenance": {
                "model_used": "VLM_PLACEHOLDER",   # Replace with actual model name after injection
                "tool_calls": state.get("trace", []),
            },
        }
        # Explicitly flag low-confidence evidence — never hide uncertainty
        if finding.get("confidence", 1.0) < 0.4:
            evidence["warning"] = "Low confidence result. Do not treat as ground truth."
        evidence_records.append(evidence)

    logger.info("evidence_composed", evidence_count=len(evidence_records), query_id=query_id)
    return {
        "status": "ok",
        "findings": [],   # No new findings; evidence is a separate output
        "evidence": evidence_records,
    }
