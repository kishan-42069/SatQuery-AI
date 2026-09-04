# VQA Agent: answers image-grounded questions and generates scene captions.
# Now integrated with GeminiVisionClient and CoordinateTransformer (Option A integration).
# Returns answers with supporting GeoJSON regions and scene classification.
from __future__ import annotations

import uuid
from pathlib import Path
from typing import Any

from app.agents.state import AgentState
from app.core.logger import get_logger

logger = get_logger("agents.vqa")


def run(state: AgentState) -> dict[str, Any]:
    """
    Runs Visual Question Answering on the primary asset.

    ── FLOW ────────────────────────────────────────────────────────────────────
    1. Extracts raster metadata (CRS, affine transform) via RasterHandler.
    2. Generates 8-bit RGB PNG preview for VLM consumption.
    3. Sends preview + VQA_PROMPT + question to GeminiVisionClient.
    4. Transforms any returned supporting_region bboxes to WGS84 GeoJSON
       via CoordinateTransformer.
    5. Returns structured answer with scene classification and GeoJSON.

    ── DATASET INJECTION POINT ──────────────────────────────────────────────
    Expected input: A single raster image (GeoTIFF, JPEG2000, PNG).
    The image path is resolved from state["asset_paths"][asset_ids[0]].
    Drop the image at: data/raw/<your_image.tif>
    ─────────────────────────────────────────────────────────────────────────

    ── MODEL INJECTION POINT ────────────────────────────────────────────────
    GeminiVisionClient uses GEMINI_API_KEY from .env.
    If not configured, falls back to deterministic heuristic VQA.
    To swap to a HuggingFace VLM (BLIP-2, LLaVA, etc.), update
    app/core/model_provider.py and use load_vlm() instead.
    ─────────────────────────────────────────────────────────────────────────
    """
    asset_ids = state.get("asset_ids", [])
    asset_paths = state.get("asset_paths", {})
    question = state.get("query_text", "")
    query_id = state.get("query_id", "SYSTEM")

    if not asset_ids:
        return {"status": "error", "error": "No assets provided for VQA.", "findings": []}

    primary_path = asset_paths.get(asset_ids[0])
    if not primary_path:
        return {"status": "error", "error": f"Asset path not found for {asset_ids[0]}.", "findings": []}

    try:
        # ── 1. Import geospatial & AI modules ────────────────────────────────
        from app.geospatial.raster_handler import extract_raster_metadata
        from app.geospatial.preview_generator import generate_rgb_preview
        from app.geospatial.coordinate_transform import CoordinateTransformer
        from app.ai.gemini_client import GeminiVisionClient
        from app.ai.prompts import VQA_PROMPT

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
        full_prompt = f"{VQA_PROMPT}\n\nUSER QUESTION:\n{question}"
        response_json = vision_client.generate_json_response(
            prompt=full_prompt,
            images=[preview_path],
            job_id=str(query_id),
        )

        answer = response_json.get("answer", "Visual analysis completed.")
        confidence = float(response_json.get("confidence", 0.90))
        scene_classification = response_json.get("scene_classification", "Earth Observation Scene")
        regions_raw = response_json.get("supporting_regions", [])

        # ── 5. Transform supporting region bboxes to GeoJSON ─────────────────
        supporting_findings = []
        geojson_features = []

        for item in regions_raw:
            finding_id = f"vqa_{uuid.uuid4().hex[:8]}"
            label = item.get("label", "Supporting Region")
            box_2d = item.get("box_2d", [100, 100, 400, 400])
            description = item.get("description", "Region answering the query")

            geojson_feat = coord_transformer.transform_box_to_geojson(
                box=box_2d,
                label=label,
                confidence=confidence,
                properties={"finding_id": finding_id, "description": description},
            )
            geojson_features.append(geojson_feat)

            supporting_findings.append(
                {
                    "finding_id": finding_id,
                    "workflow": "vqa",
                    "label": label,
                    "answer": answer,
                    "confidence": confidence,
                    "description": description,
                    "bounding_boxes": geojson_feat["properties"].get("pixel_bbox"),
                    "geojson_feature": geojson_feat,
                    "evidence_refs": [asset_ids[0]],
                }
            )

        visualization_geojson = {"type": "FeatureCollection", "features": geojson_features}

        logger.info(
            "vqa_complete",
            asset=asset_ids[0],
            confidence=confidence,
            scene=scene_classification,
            georeferenced=coord_transformer.is_georeferenced,
        )

        return {
            "status": "ok",
            "findings": supporting_findings,
            "answer": answer,
            "confidence": confidence,
            "scene_classification": scene_classification,
            "visualization_geojson": visualization_geojson,
            "raster_metadata": meta.to_dict(),
        }

    except Exception as exc:
        logger.error("vqa_failed", error=str(exc))
        return {"status": "error", "error": str(exc), "findings": []}


def run_captioning(state: AgentState) -> dict[str, Any]:
    """
    Generates a scene caption for the primary asset.

    ── DATASET INJECTION POINT ──────────────────────────────────────────────
    Expected input: A single raster image (GeoTIFF, JPEG2000, PNG).
    Drop the image at: data/raw/<your_image.tif>
    ─────────────────────────────────────────────────────────────────────────
    """
    captioning_state = dict(state)
    captioning_state["query_text"] = "Describe this satellite image in detail."
    result = run(captioning_state)
    # Relabel the finding workflow as captioning
    for f in result.get("findings", []):
        f["workflow"] = "captioning"
    return result
