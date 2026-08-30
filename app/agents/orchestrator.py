# LangGraph Orchestrator/Planner — the core agentic brain of SatQuery AI.
# Receives a query, plans the workflow, routes to the specialist, validates high-uncertainty results.
from __future__ import annotations

import json
import time
from typing import Literal

from pydantic import BaseModel, Field

from langgraph.graph import END, START, StateGraph

from app.agents.specialists import (
    change_agent,
    evidence_agent,
    grounding_agent,
    report_agent,
    sar_agent,
    vqa_agent,
)
from app.agents.state import AgentState
from app.agents.tools import ALL_TOOLS
from app.core.logger import get_logger
from app.core.model_provider import get_llm

logger = get_logger("agents.orchestrator")

# ── LLM (GPT-4o by default) ───────────────────────────────────────────────────
# ── LLM INJECTION POINT: swap provider/key via .env (LLM_PROVIDER, OPENAI_API_KEY) ──
_llm = get_llm()

# Confidence threshold below which validation is required
CONFIDENCE_THRESHOLD = 0.4


class PlannerSchema(BaseModel):
    plan: str = Field(description="Brief reasoning for the selected workflow and prompt.")
    workflow: Literal["vqa", "captioning", "grounding", "change_detection", "sar_fusion"] = Field(description="The selected specialist workflow.")
    requires_validation: bool = Field(description="True if the query is ambiguous or confidence may be low.")
    specialist_prompt: str = Field(description="A tailored prompt guiding the selected specialist agent to accomplish the sub-task.")


# ══════════════════════════════════════════════════════════════════════════════
# NODE FUNCTIONS
# Each function receives the full AgentState and returns a partial state update.
# ══════════════════════════════════════════════════════════════════════════════

def plan_node(state: AgentState) -> AgentState:
    """
    Planner node: decomposes the query and selects the specialist workflow.
    Uses the LLM to reason about which tool/agent to invoke.
    """
    query = state.get("query_text", "")
    asset_ids = state.get("asset_ids", [])
    chat_history = state.get("chat_history", [])

    trace_step = {"step": "plan", "input": {"query": query[:200], "asset_count": len(asset_ids)}}
    
    history_str = "\n".join([f"{msg.get('role', 'user')}: {msg.get('content', '')}" for msg in chat_history[-5:]]) if chat_history else "No previous context."

    prompt = f"""You are the SatQuery AI orchestrator for satellite image analysis.

Recent Conversation Context:
{history_str}

User query: {query}
Available assets: {asset_ids}
Available workflows: vqa, captioning, grounding, change_detection, sar_fusion

Based on the query and available assets, select EXACTLY ONE workflow.
Generate a specific `specialist_prompt` to guide the chosen agent for this task.

Rules:
- Prefer geospatial/deterministic operations over model calls when possible.
- Set requires_validation=true if the query is ambiguous or confidence may be low.
"""

    structured_llm = _llm.with_structured_output(PlannerSchema)

    try:
        parsed: PlannerSchema = structured_llm.invoke(prompt)
        plan = parsed.plan
        workflow = parsed.workflow
        requires_validation = parsed.requires_validation
        specialist_prompt = parsed.specialist_prompt
    except Exception as exc:
        logger.warning("plan_parse_failed", error=str(exc))
        plan = f"Defaulted to VQA due to planning error: {exc}"
        workflow = "vqa"
        requires_validation = True
        specialist_prompt = query

    trace_step["output"] = {"plan": plan, "workflow": workflow, "requires_validation": requires_validation, "specialist_prompt": specialist_prompt}
    logger.info("plan_complete", workflow=workflow, requires_validation=requires_validation)

    return {
        "plan": plan,
        "selected_workflow": workflow,
        "specialist_prompt": specialist_prompt,
        "requires_validation": requires_validation,
        "trace": state.get("trace", []) + [trace_step],
        "intermediate_outputs": {},
        "findings": [],
        "evidence": [],
        "error": None,
    }


def vqa_node(state: AgentState) -> AgentState:
    result = vqa_agent.run(state)
    return _merge_agent_result(state, "vqa", result)


def captioning_node(state: AgentState) -> AgentState:
    result = vqa_agent.run_captioning(state)  # Captioning shares the VLM with VQA
    return _merge_agent_result(state, "captioning", result)


def grounding_node(state: AgentState) -> AgentState:
    result = grounding_agent.run(state)
    return _merge_agent_result(state, "grounding", result)


def change_detection_node(state: AgentState) -> AgentState:
    result = change_agent.run(state)
    return _merge_agent_result(state, "change_detection", result)


def sar_fusion_node(state: AgentState) -> AgentState:
    result = sar_agent.run(state)
    return _merge_agent_result(state, "sar_fusion", result)


def validation_node(state: AgentState) -> AgentState:
    """Validation node: reviews findings for high-uncertainty tasks before synthesis."""
    findings = state.get("findings", [])
    trace_step = {"step": "validation", "finding_count": len(findings)}

    low_confidence = [f for f in findings if f.get("confidence", 1.0) < CONFIDENCE_THRESHOLD]
    uncertainty_flag = len(low_confidence) > 0

    if uncertainty_flag:
        logger.warning("validation_low_confidence", low_confidence_count=len(low_confidence))
        trace_step["warning"] = f"{len(low_confidence)} finding(s) below confidence threshold {CONFIDENCE_THRESHOLD}"

    return {
        "uncertainty_flag": uncertainty_flag,
        "trace": state.get("trace", []) + [trace_step],
    }


def evidence_node(state: AgentState) -> AgentState:
    result = evidence_agent.run(state)
    return _merge_agent_result(state, "evidence", result)


def report_node(state: AgentState) -> AgentState:
    result = report_agent.run(state)
    return _merge_agent_result(state, "report", result)


def error_node(state: AgentState) -> AgentState:
    """Terminal error node: logs the failure and returns a clean error state."""
    err = state.get("error", "Unknown error")
    logger.error("pipeline_error", error=err, query_id=state.get("query_id"))
    trace_step = {"step": "error", "message": err}
    return {"trace": state.get("trace", []) + [trace_step]}


# ══════════════════════════════════════════════════════════════════════════════
# ROUTING FUNCTIONS
# ══════════════════════════════════════════════════════════════════════════════

def route_after_plan(state: AgentState) -> Literal["vqa", "captioning", "grounding", "change_detection", "sar_fusion", "error"]:
    """Routes to the correct specialist based on the planner's decision."""
    if state.get("error"):
        return "error"
    workflow = state.get("selected_workflow", "vqa")
    if workflow in ("vqa", "captioning", "grounding", "change_detection", "sar_fusion"):
        return workflow
    logger.warning("unknown_workflow", workflow=workflow)
    return "vqa"


def route_after_specialist(state: AgentState) -> Literal["validation", "evidence"]:
    """If the planner flagged high uncertainty, validate before synthesizing."""
    if state.get("error"):
        return "evidence"  # Let evidence agent capture partial results
    if state.get("requires_validation"):
        return "validation"
    return "evidence"


def route_after_validation(state: AgentState) -> Literal["evidence", "error"]:
    if state.get("uncertainty_flag") and not state.get("findings"):
        return "error"
    return "evidence"


# ══════════════════════════════════════════════════════════════════════════════
# GRAPH ASSEMBLY
# ══════════════════════════════════════════════════════════════════════════════

def build_graph() -> StateGraph:
    g = StateGraph(AgentState)

    # Add nodes
    g.add_node("plan", plan_node)
    g.add_node("vqa", vqa_node)
    g.add_node("captioning", captioning_node)
    g.add_node("grounding", grounding_node)
    g.add_node("change_detection", change_detection_node)
    g.add_node("sar_fusion", sar_fusion_node)
    g.add_node("validation", validation_node)
    g.add_node("evidence", evidence_node)
    g.add_node("report", report_node)
    g.add_node("error", error_node)

    # Entry
    g.add_edge(START, "plan")

    # Planner → specialist routing
    g.add_conditional_edges("plan", route_after_plan, {
        "vqa": "vqa",
        "captioning": "captioning",
        "grounding": "grounding",
        "change_detection": "change_detection",
        "sar_fusion": "sar_fusion",
        "error": "error",
    })

    # Each specialist → validation or evidence
    for specialist in ("vqa", "captioning", "grounding", "change_detection", "sar_fusion"):
        g.add_conditional_edges(specialist, route_after_specialist, {
            "validation": "validation",
            "evidence": "evidence",
        })

    g.add_conditional_edges("validation", route_after_validation, {
        "evidence": "evidence",
        "error": "error",
    })

    g.add_edge("evidence", "report")
    g.add_edge("report", END)
    g.add_edge("error", END)

    return g


# Compiled graph — import this in the query worker
orchestrator_graph = build_graph().compile()


# ── Helper ────────────────────────────────────────────────────────────────────
def _merge_agent_result(state: AgentState, agent_name: str, result: dict) -> AgentState:
    trace_step = {"step": agent_name, "status": result.get("status", "ok")}
    if result.get("error"):
        trace_step["error"] = result["error"]
    outputs = state.get("intermediate_outputs", {})
    outputs[agent_name] = result
    findings = state.get("findings", []) + result.get("findings", [])
    return {
        "intermediate_outputs": outputs,
        "findings": findings,
        "error": result.get("error"),
        "trace": state.get("trace", []) + [trace_step],
    }


from app.core.metrics import track_performance

async def run_pipeline(query_id: str, session_id: str, query_text: str, asset_ids: list[str], asset_paths: dict, chat_history: list[dict] = None) -> AgentState:
    """Entry point: invokes the compiled graph and returns the final state."""
    initial_state: AgentState = {
        "query_id": query_id,
        "session_id": session_id,
        "query_text": query_text,
        "asset_ids": asset_ids,
        "asset_paths": asset_paths,
        "chat_history": chat_history or [],
        "trace": [{"step": "start", "query_id": query_id, "session_id": session_id}],
    }
    with track_performance(f"pipeline_run_{query_id}"):
        final_state = await orchestrator_graph.ainvoke(initial_state)
    logger.info("pipeline_complete", query_id=query_id)
    return final_state
