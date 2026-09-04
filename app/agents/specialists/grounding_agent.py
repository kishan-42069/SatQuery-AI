# Grounding Agent: finds requested entities/regions in a satellite image.
# Now integrated with GeminiVisionClient and CoordinateTransformer (Option A integration).
# Returns real WGS84 GeoJSON bounding boxes for detected features.
from __future__ import annotations

import uuid
from pathlib import Path
from typing import Any

from app.agents.state import AgentState
from app.core.logger import get_logger

logger = get_logger("agents.grounding")


def run(state: AgentState) -> dict[str, Any]:
    """
    Runs open-vocabulary geospatial grounding on the primary asset.

    ── FLOW ────────────────────────────────────────────────────────────────────
    1. Extracts raster metadata (CRS, affine transform) via RasterHandler.
    2. Generates 8-bit RGB PNG preview for VLM consumption.
    3. Sends preview + GROUNDING_PROMPT + entity query to GeminiVisionClient.
    4. Transforms each returned [ymin, xmin, ymax, xmax] pixel bbox to
       WGS84 GeoJSON polygon via CoordinateTransformer.
    5. Returns structured findings with GeoJSON feature collection.

    ── DATASET INJECTION POINT ──────────────────────────────────────────────
    Expected input: A raster image + a text label/entity prompt.
    Image path: data/raw/<optical_image.tif>
    Entity prompt: extracted from state["query_text"]
    ─────────────────────────────────────────────────────────────────────────

    ── MODEL INJECTION POINT ────────────────────────────────────────────────
    GeminiVisionClient uses GEMINI_API_KEY from .env.
    If not configured, falls back to deterministic heuristic grounding.
    ─────────────────────────────────────────────────────────────────────────
    """
    asset_ids = state.get("asset_ids", [])
    asset_paths = state.get("asset_paths", {})
    entity_prompt = state.get("query_text", "")
    query_id = state.get("query_id", "SYSTEM")

    if not asset_ids:
        return {"status": "error", "error": "No assets provided for grounding.", "findings": []}

    primary_path = asset_paths.get(asset_ids[0])
    if not primary_path:
        return {"status": "error", "error": f"Asset path not found for {asset_ids[0]}.", "findings": []}

    try:
        # ── 1. Import geospatial & AI modules ────────────────────────────────
        from app.geospatial.raster_handler import extract_raster_metadata
        from app.geospatial.preview_generator import generate_rgb_preview
        from app.geospatial.coordinate_transform import CoordinateTransformer
        from app.ai.gemini_client import GeminiVisionClient
        from app.ai.prompts import GROUNDING_PROMPT

        # ── 2. Extract raster metadata ────────────────────────────────────────
        meta = extract_raster_metadata(primary_path)
        coord_transformer = CoordinateTransformer(
            width=meta.width,
            height=meta.height,
            affine_transform=meta.transform,
            crs_str=meta.crs_str,
            crs_epsg=meta.crs_epsg,
        )

        # ── 3. Generate PNG preview for VLM ──────────────────────────────────
        preview_dir = Path("./data/previews")
        preview_path = str(
            generate_rgb_preview(primary_path, preview_dir / f"{asset_ids[0]}_preview.png")
        )

        # ── 4. Call Gemini VLM (or offline heuristic fallback) ────────────────
        vision_client = GeminiVisionClient()
        full_prompt = f"{GROUNDING_PROMPT}\n\nUSER QUERY:\n{entity_prompt}"
        response_json = vision_client.generate_json_response(
            prompt=full_prompt,
            images=[preview_path],
            job_id=str(query_id),
        )

        findings_raw = response_json.get("findings", [])
        total_detected = response_json.get("total_detected", len(findings_raw))
        summary = response_json.get("summary", "Grounding analysis completed.")

        # ── 5. Transform pixel bboxes to GeoJSON WGS84 features ──────────────
        findings = []
        geojson_features = []

        for item in findings_raw:
            finding_id = f"fnd_{uuid.uuid4().hex[:8]}"
            label = item.get("label", "Detected Feature")
            box_2d = item.get("box_2d", [0, 0, 100, 100])
            confidence = float(item.get("confidence", 0.90))
            description = item.get("description", f"Localized region for {label}")

            geojson_feat = coord_transformer.transform_box_to_geojson(
                box=box_2d,
                label=label,
                confidence=confidence,
                properties={"finding_id": finding_id, "description": description},
            )
            geojson_features.append(geojson_feat)

            findings.append(
                {
                    "finding_id": finding_id,
                    "workflow": "grounding",
                    "label": label,
                    "answer": None,
                    "confidence": confidence,
                    "description": description,
                    "bounding_boxes": geojson_feat["properties"].get("pixel_bbox"),
                    "geojson_feature": geojson_feat,
                    "evidence_refs": [asset_ids[0]],
                }
            )

        visualization_geojson = {"type": "FeatureCollection", "features": geojson_features}

        logger.info(
            "grounding_complete",
            entity=entity_prompt,
            total_detected=total_detected,
            georeferenced=coord_transformer.is_georeferenced,
        )

        return {
            "status": "ok",
            "findings": findings,
            "total_detected": total_detected,
            "summary": summary,
            "visualization_geojson": visualization_geojson,
            "raster_metadata": meta.to_dict(),
        }

    except Exception as exc:
        logger.error("grounding_failed", error=str(exc))
        return {"status": "error", "error": str(exc), "findings": []}
