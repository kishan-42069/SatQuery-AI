# Shared AgentState TypedDict that flows through the entire LangGraph pipeline.
from __future__ import annotations

from typing import Any, Optional
from typing_extensions import TypedDict


class AgentState(TypedDict, total=False):
    """
    The single shared state object passed between all nodes in the LangGraph graph.
    Every field is optional (total=False) so nodes only update what they touch.
    """

    # ── Input ────────────────────────────────────────────────────────────────
    query_id: str
    session_id: str
    query_text: str                          # Sanitized NL query from the user
    asset_ids: list[str]                     # Asset IDs referenced in this query
    asset_paths: dict[str, str]              # asset_id -> local file path

    # ── Plan ─────────────────────────────────────────────────────────────────
    plan: str                                # Orchestrator's plain-text reasoning
    selected_workflow: str                   # Which specialist to invoke
    requires_validation: bool                # High-uncertainty flag triggers validation step

    # ── Intermediate outputs (passed between specialist agents) ───────────────
    intermediate_outputs: dict[str, Any]     # Keyed by agent name

    # ── Final findings ────────────────────────────────────────────────────────
    findings: list[dict[str, Any]]           # Structured finding dicts
    evidence: list[dict[str, Any]]           # Provenance chain for findings

    # ── Explainability trace ──────────────────────────────────────────────────
    trace: list[dict[str, Any]]              # Machine-readable step-by-step trace
    uncertainty_flag: bool                   # True if model confidence is low

    # ── Errors ───────────────────────────────────────────────────────────────
    error: Optional[str]                     # Non-None if the pipeline failed
