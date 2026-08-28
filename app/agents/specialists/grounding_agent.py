# Grounding Agent: finds requested entities/regions in an image.
# Returns bounding boxes / masks + confidence scores.
from __future__ import annotations

import uuid
from typing import Any

from app.agents.state import AgentState
from app.core.logger import get_logger
from app.core.model_provider import load_vlm

logger = get_logger("agents.grounding")


def run(state: AgentState) -> dict[str, Any]:
    """
    Runs open-vocabulary grounding on the primary asset.

    ── DATASET INJECTION POINT ──────────────────────────────────────────────
    Expected input: A raster image + a text label/entity prompt.
    Image path: data/raw/<optical_image.tif>
    Entity prompt: extracted from state["query_text"]
    ─────────────────────────────────────────────────────────────────────────

    ── MODEL INJECTION POINT ────────────────────────────────────────────────
    Grounding models (e.g., GroundingDINO, OWL-ViT) should be loaded here.
    Replace load_vlm() with the appropriate grounding model loader once chosen.
    Set the model checkpoint via VLM_MODEL_NAME in .env.
    ─────────────────────────────────────────────────────────────────────────
    """
    asset_ids = state.get("asset_ids", [])
    asset_paths = state.get("asset_paths", {})
    entity_prompt = state.get("query_text", "")

    if not asset_ids:
        return {"status": "error", "error": "No assets provided for grounding.", "findings": []}

    primary_path = asset_paths.get(asset_ids[0])
    if not primary_path:
        return {"status": "error", "error": f"Asset path not found for {asset_ids[0]}.", "findings": []}

    processor, model = load_vlm()

    try:
        from PIL import Image
        image = Image.open(primary_path).convert("RGB")

        # ── MODEL INJECTION POINT ────────────────────────────────────────
        # Replace with actual grounding model inference (e.g., GroundingDINO):
        # inputs = processor(images=image, text=entity_prompt, return_tensors="pt")
        # outputs = model(**inputs)
        # boxes, scores = post_process(outputs, ...)
        # ────────────────────────────────────────────────────────────────
        boxes = []   # Placeholder: list of [x_min, y_min, x_max, y_max]
        scores = []  # Placeholder: list of float confidence scores

        findings = [
            {
                "finding_id": uuid.uuid4().hex,
                "workflow": "grounding",
                "label": entity_prompt,
                "answer": None,
                "confidence": float(s),
                "bounding_boxes": [{"x_min": b[0], "y_min": b[1], "x_max": b[2], "y_max": b[3], "crs": None}],
                "evidence_refs": [asset_ids[0]],
            }
            for b, s in zip(boxes, scores)
        ]
        logger.info("grounding_complete", entity=entity_prompt, box_count=len(findings))
        return {"status": "ok", "findings": findings}

    except Exception as exc:
        logger.error("grounding_failed", error=str(exc))
        return {"status": "error", "error": str(exc), "findings": []}
