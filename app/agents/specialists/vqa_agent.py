# VQA Agent: answers image-grounded questions and generates scene captions.
# Returns answer + supporting region for VQA; caption text for captioning.
from __future__ import annotations

import uuid
from typing import Any

from app.agents.state import AgentState
from app.core.logger import get_logger
from app.core.model_provider import load_vlm

logger = get_logger("agents.vqa")


def run(state: AgentState) -> dict[str, Any]:
    """
    Runs Visual Question Answering on the primary asset.

    ── DATASET INJECTION POINT ──────────────────────────────────────────────
    Expected input: A single raster image (GeoTIFF, JPEG2000, PNG).
    The image path is resolved from state["asset_paths"][asset_ids[0]].
    Drop the image at: data/raw/<your_image.tif>
    ─────────────────────────────────────────────────────────────────────────

    ── MODEL INJECTION POINT ────────────────────────────────────────────────
    Set VLM_MODEL_NAME in .env. The processor and model are loaded via
    app/core/model_provider.py -> load_vlm().
    ─────────────────────────────────────────────────────────────────────────
    """
    asset_ids = state.get("asset_ids", [])
    asset_paths = state.get("asset_paths", {})
    question = state.get("query_text", "")

    if not asset_ids:
        return {"status": "error", "error": "No assets provided for VQA.", "findings": []}

    primary_path = asset_paths.get(asset_ids[0])
    if not primary_path:
        return {"status": "error", "error": f"Asset path not found for {asset_ids[0]}.", "findings": []}

    processor, model = load_vlm()

    try:
        from PIL import Image
        image = Image.open(primary_path).convert("RGB")
        inputs = processor(images=image, text=question, return_tensors="pt")
        outputs = model.generate(**inputs, max_new_tokens=256)
        answer = processor.decode(outputs[0], skip_special_tokens=True)
        confidence = 0.75  # Placeholder; replace with model logit score

        finding = {
            "finding_id": uuid.uuid4().hex,
            "workflow": "vqa",
            "answer": answer,
            "label": None,
            "confidence": confidence,
            "bounding_boxes": None,
            "evidence_refs": [asset_ids[0]],
        }
        logger.info("vqa_complete", asset=asset_ids[0], confidence=confidence)
        return {"status": "ok", "findings": [finding]}

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
