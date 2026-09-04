# Change Detection Agent: analyzes bi-temporal differences between two GeoTIFF images.
# Now integrated with GeminiVisionClient and CoordinateTransformer (Option A integration).
# Returns classified change regions mapped to real WGS84 GeoJSON coordinates.
from __future__ import annotations

import uuid
from pathlib import Path
from typing import Any

import numpy as np

from app.agents.state import AgentState
from app.core.logger import get_logger

logger = get_logger("agents.change")


def run(state: AgentState) -> dict[str, Any]:
    """
    Runs bi-temporal change detection between the first two provided assets.

    ── FLOW ────────────────────────────────────────────────────────────────────
    1. Extracts raster metadata (CRS, affine transform, dimensions) from both
       GeoTIFFs using RasterHandler.
    2. Generates 8-bit RGB PNG previews via PreviewGenerator for VLM input.
    3. Sends both previews + CHANGE_DETECTION_PROMPT to GeminiVisionClient.
    4. Transforms each returned [ymin, xmin, ymax, xmax] pixel bounding box
       to WGS84 GeoJSON polygon via CoordinateTransformer.
    5. Returns structured findings with GeoJSON visualization.

    ── DATASET INJECTION POINT ──────────────────────────────────────────────
    Expected input: TWO raster images at the same spatial extent (before/after).
    Before image: data/raw/<before_image.tif>
    After image:  data/raw/<after_image.tif>
    Provide both asset IDs in the query: asset_ids[0]=before, asset_ids[1]=after.
    Both must share the same CRS and spatial extent (or be pre-registered).
    ─────────────────────────────────────────────────────────────────────────

    ── MODEL INJECTION POINT ────────────────────────────────────────────────
    GeminiVisionClient uses GEMINI_API_KEY from .env.
    If not configured, the client falls back to deterministic pixel-diff mode.
    ─────────────────────────────────────────────────────────────────────────
    """
    asset_ids = state.get("asset_ids", [])
    asset_paths = state.get("asset_paths", {})
    query_text = state.get("query_text", "Perform bi-temporal change detection.")
    query_id = state.get("query_id", "SYSTEM")

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
        # ── 1. Import geospatial & AI modules ────────────────────────────────
        from app.geospatial.raster_handler import extract_raster_metadata
        from app.geospatial.preview_generator import generate_rgb_preview
        from app.geospatial.coordinate_transform import CoordinateTransformer
        from app.ai.gemini_client import GeminiVisionClient
        from app.ai.prompts import CHANGE_DETECTION_PROMPT

        # ── 2. Extract raster metadata from the primary (before) image ───────
        meta = extract_raster_metadata(before_path)
        coord_transformer = CoordinateTransformer(
            width=meta.width,
            height=meta.height,
            affine_transform=meta.transform,
            crs_str=meta.crs_str,
            crs_epsg=meta.crs_epsg,
        )

        # ── 3. Generate PNG previews for VLM consumption ─────────────────────
        preview_dir = Path("./data/previews")
        preview_1 = str(generate_rgb_preview(before_path, preview_dir / f"{asset_ids[0]}_preview.png"))
        preview_2 = str(generate_rgb_preview(after_path, preview_dir / f"{asset_ids[1]}_preview.png"))

        # ── 4. Call Gemini VLM (or offline heuristic fallback) ────────────────
        vision_client = GeminiVisionClient()
        full_prompt = (
            f"{CHANGE_DETECTION_PROMPT}\n\n"
            f"USER QUERY:\n{query_text}\n\n"
            f"Image 1 represents Reference (T1 / Baseline). Image 2 represents Target (T2 / Subsequent)."
        )
        response_json = vision_client.generate_json_response(
            prompt=full_prompt,
            images=[preview_1, preview_2],
            job_id=str(query_id),
        )

        changes_detected = bool(response_json.get("changes_detected", True))
        overall_change_level = response_json.get("overall_change_level", "significant")
        summary = response_json.get(
            "summary",
            "Bi-temporal satellite analysis completed. Significant changes detected in target sector.",
        )
        regions_raw = response_json.get("change_regions", [])

        # ── 5. Transform pixel bboxes to GeoJSON WGS84 features ──────────────
        findings = []
        geojson_features = []

        for item in regions_raw:
            reg_id = f"chg_{uuid.uuid4().hex[:8]}"
            change_type = item.get("change_type", "Detected Surface Change")
            box_2d = item.get("box_2d", [100, 100, 500, 500])
            confidence = float(item.get("confidence", 0.90))
            before_state = item.get("before_state", "Baseline terrain state")
            after_state = item.get("after_state", "Modified surface state")
            description = item.get("description", f"Change detected: {change_type}")

            geojson_feat = coord_transformer.transform_box_to_geojson(
                box=box_2d,
                label=change_type,
                confidence=confidence,
                properties={
                    "region_id": reg_id,
                    "change_type": change_type,
                    "before_state": before_state,
                    "after_state": after_state,
                    "description": description,
                },
            )
            geojson_features.append(geojson_feat)

            findings.append(
                {
                    "finding_id": reg_id,
                    "workflow": "change_detection",
                    "label": change_type,
                    "answer": description,
                    "confidence": confidence,
                    "change_type": change_type,
                    "before_state": before_state,
                    "after_state": after_state,
                    "bounding_boxes": geojson_feat["properties"].get("pixel_bbox"),
                    "geojson_feature": geojson_feat,
                    "evidence_refs": asset_ids[:2],
                }
            )

        visualization_geojson = {"type": "FeatureCollection", "features": geojson_features}

        logger.info(
            "change_detection_complete",
            changes_detected=changes_detected,
            level=overall_change_level,
            region_count=len(findings),
            georeferenced=coord_transformer.is_georeferenced,
        )

        return {
            "status": "ok",
            "findings": findings,
            "summary": summary,
            "changes_detected": changes_detected,
            "overall_change_level": overall_change_level,
            "visualization_geojson": visualization_geojson,
            "raster_metadata": meta.to_dict(),
        }

    except Exception as exc:
        logger.error("change_detection_failed", error=str(exc))
        # Graceful degradation: return basic pixel-diff result
        return _fallback_pixel_diff(before_path, after_path, asset_ids)


def _fallback_pixel_diff(before_path: str, after_path: str, asset_ids: list) -> dict[str, Any]:
    """
    Emergency pixel-difference fallback used when the full pipeline errors.
    Preserves backward compatibility with pre-integration behavior.
    """
    try:
        import rasterio

        with rasterio.open(before_path) as src_before, rasterio.open(after_path) as src_after:
            before_arr = src_before.read(1).astype(float)
            after_arr = src_after.read(1).astype(float)

        diff = np.abs(after_arr - before_arr)
        threshold = np.mean(diff) + 2 * np.std(diff)
        change_mask = diff > threshold
        change_fraction = float(change_mask.mean())

        label = "change_detected" if change_fraction > 0.01 else "no_significant_change"
        confidence = min(1.0, 1.0 - change_fraction)

        finding = {
            "finding_id": uuid.uuid4().hex,
            "workflow": "change_detection",
            "label": label,
            "answer": f"Detected change in {change_fraction * 100:.1f}% of the scene.",
            "confidence": round(confidence, 4),
            "bounding_boxes": None,
            "evidence_refs": asset_ids[:2],
        }
        return {"status": "ok", "findings": [finding]}
    except Exception as exc:
        return {"status": "error", "error": str(exc), "findings": []}
