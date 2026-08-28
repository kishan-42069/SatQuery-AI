# Change Detection Agent: analyzes bi-temporal differences between two images.
# Returns a change map + classified change types.
from __future__ import annotations

import uuid
from typing import Any

import numpy as np

from app.agents.state import AgentState
from app.core.logger import get_logger

logger = get_logger("agents.change")


def run(state: AgentState) -> dict[str, Any]:
    """
    Runs bi-temporal change detection between the first two provided assets.

    ── DATASET INJECTION POINT ──────────────────────────────────────────────
    Expected input: TWO raster images at the same spatial extent (before/after).
    Before image: data/raw/<before_image.tif>
    After image:  data/raw/<after_image.tif>
    Provide both asset IDs in the query: asset_ids[0]=before, asset_ids[1]=after.
    Both must share the same CRS and spatial extent (or be pre-registered).
    ─────────────────────────────────────────────────────────────────────────

    ── MODEL INJECTION POINT ────────────────────────────────────────────────
    Replace the pixel-difference baseline with a deep change detection model
    (e.g., BIT, ChangeFormer, SiamSeg) once the model is chosen.
    Load the model via app/core/model_provider.py -> load_vlm() or a separate loader.
    ─────────────────────────────────────────────────────────────────────────
    """
    asset_ids = state.get("asset_ids", [])
    asset_paths = state.get("asset_paths", {})

    if len(asset_ids) < 2:
        return {
            "status": "error",
            "error": "Change detection requires exactly 2 assets (before and after). Provide both asset_ids.",
            "findings": [],
        }

    before_path = asset_paths.get(asset_ids[0])
    after_path = asset_paths.get(asset_ids[1])

    if not before_path or not after_path:
        return {"status": "error", "error": "One or both asset paths not found.", "findings": []}

    try:
        import rasterio

        with rasterio.open(before_path) as src_before, rasterio.open(after_path) as src_after:
            before_arr = src_before.read(1).astype(float)
            after_arr = src_after.read(1).astype(float)

        # ── Baseline: pixel-wise absolute difference ─────────────────────────
        # Replace this block with your deep change detection model inference.
        diff = np.abs(after_arr - before_arr)
        threshold = np.mean(diff) + 2 * np.std(diff)
        change_mask = diff > threshold
        change_fraction = float(change_mask.mean())

        change_classes = _classify_changes(change_fraction)
        confidence = min(1.0, 1.0 - change_fraction)  # Heuristic; replace with model score

        finding = {
            "finding_id": uuid.uuid4().hex,
            "workflow": "change_detection",
            "label": "change_detected" if change_fraction > 0.01 else "no_significant_change",
            "answer": f"Detected change in {change_fraction * 100:.1f}% of the scene.",
            "confidence": round(confidence, 4),
            "change_classes": change_classes,
            "bounding_boxes": None,
            "evidence_refs": asset_ids[:2],
        }
        logger.info("change_detection_complete", change_fraction=change_fraction, classes=change_classes)
        return {"status": "ok", "findings": [finding]}

    except Exception as exc:
        logger.error("change_detection_failed", error=str(exc))
        return {"status": "error", "error": str(exc), "findings": []}


def _classify_changes(fraction: float) -> list[str]:
    """Simple heuristic change class labeler — replace with model-predicted classes."""
    if fraction < 0.01:
        return ["no_change"]
    classes = []
    if fraction > 0.3:
        classes.append("large_scale_change")
    if fraction > 0.05:
        classes.append("moderate_change")
    else:
        classes.append("minor_change")
    return classes
