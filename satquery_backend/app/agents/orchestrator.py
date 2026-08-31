"""
Orchestrator Agent: Central planning, tool calling, and workflow dispatch for SatQuery AI.
"""

import time
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional
from app.agents.change_agent import ChangeDetectionAgent
from app.agents.grounding_agent import GroundingAgent
from app.agents.report_agent import ReportAgent
from app.agents.schemas import (
    AnalysisResponse,
    GeoJSONFeatureCollection,
    OrchestratorPlan,
)
from app.agents.vqa_agent import VQAAgent
from app.ai.gemini_client import GeminiVisionClient
from app.ai.prompts import ORCHESTRATOR_INTENT_PROMPT
from app.core.logging_config import logger
from app.geospatial.coordinate_transform import CoordinateTransformer


class OrchestratorAgent:
    """
    Central cognitive coordinator. Analyzes natural-language query and inputs,
    plans tool routing, dispatches to specialist agents, and coordinates reporting.
    """

    def __init__(self, vision_client: Optional[GeminiVisionClient] = None):
        self.vision_client = vision_client or GeminiVisionClient()
        self.grounding_agent = GroundingAgent(self.vision_client)
        self.change_agent = ChangeDetectionAgent(self.vision_client)
        self.vqa_agent = VQAAgent(self.vision_client)
        self.report_agent = ReportAgent(self.vision_client)

    async def plan_workflow(
        self,
        query: str,
        has_dual_images: bool,
        image_previews: List[str],
        job_id: str = "SYSTEM",
    ) -> OrchestratorPlan:
        """
        Determines the appropriate specialist workflow via VLM planning.
        """
        logger.info(f"[{job_id}] Orchestrator analyzing query intent for: '{query}' (dual_images={has_dual_images})")

        prompt = (
            f"{ORCHESTRATOR_INTENT_PROMPT}\n\n"
            f"USER QUERY: {query}\n"
            f"AVAILABLE INPUTS: {len(image_previews)} image(s) provided. Dual-temporal input={has_dual_images}."
        )

        response_json = self.vision_client.generate_json_response(
            prompt=prompt,
            images=image_previews[:1] if image_previews else None,
            job_id=job_id,
        )

        workflow = response_json.get("workflow", "change_detection" if has_dual_images else "vqa")
        
        # Enforce consistency: if 2 images are provided and query implies comparison/difference, prioritize change detection
        q_lower = query.lower()
        if has_dual_images and ("diff" in q_lower or "change" in q_lower or "compare" in q_lower or "two" in q_lower):
            workflow = "change_detection"

        return OrchestratorPlan(
            workflow=workflow,
            reasoning=response_json.get("reasoning", f"Selected {workflow} based on query analysis and input availability."),
            target_features=response_json.get("target_features", []),
            comparison_mode=has_dual_images or bool(response_json.get("comparison_mode", False)),
            confidence=float(response_json.get("confidence", 0.95)),
        )

    async def run_pipeline(
        self,
        query: str,
        image_1_preview_path: str,
        image_1_metadata: Dict[str, Any],
        image_2_preview_path: Optional[str] = None,
        image_2_metadata: Optional[Dict[str, Any]] = None,
        job_id: Optional[str] = None,
    ) -> AnalysisResponse:
        """
        Executes the full end-to-end multi-agent pipeline.
        """
        job_id = job_id or f"job_{uuid.uuid4().hex[:10]}"
        start_time = time.time()
        trace: List[Dict[str, Any]] = []

        def log_step(step_name: str, agent_name: str, status: str, details: Any, start_t: float):
            duration = round((time.time() - start_t) * 1000, 2)
            trace.append({
                "step": step_name,
                "agent": agent_name,
                "status": status,
                "duration_ms": duration,
                "details": details,
            })
            logger.info(f"[{job_id}] [{agent_name}] {step_name} completed in {duration}ms (status={status})")

        has_dual = bool(image_2_preview_path)
        previews = [image_1_preview_path] + ([image_2_preview_path] if image_2_preview_path else [])

        # Step 1: Initialize Coordinate Transformer from Image 1 / Target GeoTIFF
        step_t = time.time()
        dims = image_1_metadata.get("dimensions", {"width": 1024, "height": 1024})
        transform = image_1_metadata.get("affine_transform", [1.0, 0.0, 0.0, 0.0, 1.0, 0.0])
        crs_info = image_1_metadata.get("crs", {})
        coord_transformer = CoordinateTransformer(
            width=dims.get("width", 1024),
            height=dims.get("height", 1024),
            affine_transform=transform,
            crs_str=crs_info.get("wkt"),
            crs_epsg=crs_info.get("epsg"),
        )
        log_step(
            step_name="Geospatial Alignment & Coordinate Transformer Initialization",
            agent_name="GeospatialEngine",
            status="success",
            details={
                "crs_epsg": coord_transformer.crs_epsg,
                "is_georeferenced": coord_transformer.is_georeferenced,
                "dimensions": dims
            },
            start_t=step_t,
        )

        # Step 2: Orchestration & Planning
        step_t = time.time()
        plan = await self.plan_workflow(
            query=query,
            has_dual_images=has_dual,
            image_previews=previews,
            job_id=job_id,
        )
        log_step(
            step_name="Query Analysis & Workflow Selection",
            agent_name="OrchestratorAgent",
            status="success",
            details=plan.model_dump(),
            start_t=step_t,
        )

        # Step 3: Route to Specialist Agent
        step_t = time.time()
        specialist_output: Any = None
        visualization_collection = GeoJSONFeatureCollection()

        if plan.workflow == "change_detection" and has_dual and image_2_preview_path:
            specialist_output = await self.change_agent.execute(
                query=query,
                image_1_preview_path=image_1_preview_path,
                image_2_preview_path=image_2_preview_path,
                coord_transformer=coord_transformer,
                job_id=job_id,
            )
            visualization_collection = specialist_output.visualization_geojson
            log_step(
                step_name="Bi-temporal Change Detection & Feature Localization",
                agent_name="ChangeDetectionAgent",
                status="success",
                details={
                    "changes_detected": specialist_output.changes_detected,
                    "overall_change_level": specialist_output.overall_change_level,
                    "regions_count": len(specialist_output.change_regions),
                },
                start_t=step_t,
            )

        elif plan.workflow == "grounding":
            specialist_output = await self.grounding_agent.execute(
                query=query,
                image_preview_path=image_1_preview_path,
                coord_transformer=coord_transformer,
                job_id=job_id,
            )
            visualization_collection = specialist_output.visualization_geojson
            log_step(
                step_name="Text-Guided Grounding & Spatial Delineation",
                agent_name="GroundingAgent",
                status="success",
                details={
                    "total_detected": specialist_output.total_detected,
                    "summary": specialist_output.summary,
                },
                start_t=step_t,
            )

        else:  # VQA / General Scene Understanding
            specialist_output = await self.vqa_agent.execute(
                query=query,
                image_preview_path=image_1_preview_path,
                coord_transformer=coord_transformer,
                job_id=job_id,
            )
            visualization_collection = specialist_output.visualization_geojson
            log_step(
                step_name="Visual Question Answering & Reasoning",
                agent_name="VQAAgent",
                status="success",
                details={
                    "answer": specialist_output.answer,
                    "confidence": specialist_output.confidence,
                },
                start_t=step_t,
            )

        # Step 4: Executive Report Synthesis
        step_t = time.time()
        combined_metadata = {
            "image_1": image_1_metadata,
            "image_2": image_2_metadata if image_2_metadata else None,
        }
        report_result = await self.report_agent.execute(
            query=query,
            plan=plan,
            specialist_result=specialist_output,
            metadata=combined_metadata,
            job_id=job_id,
        )
        log_step(
            step_name="Multi-Agent Evidence & Executive Report Synthesis",
            agent_name="ReportAgent",
            status="success",
            details={"executive_summary": report_result.executive_summary[:120] + "..."},
            start_t=step_t,
        )

        analysis_dict = specialist_output.model_dump() if hasattr(specialist_output, "model_dump") else {}

        logger.info(f"[{job_id}] End-to-end pipeline finished in {round((time.time() - start_time) * 1000, 2)}ms")

        return AnalysisResponse(
            status="success",
            job_id=job_id,
            query=query,
            orchestrator_plan=plan,
            analysis=analysis_dict,
            visualization=visualization_collection,
            report=report_result,
            metadata=combined_metadata,
            execution_trace=trace,
        )
