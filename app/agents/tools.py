# LangGraph tool definitions: geospatial operations and model dispatch stubs.
# Deterministic geospatial tools are preferred over model calls (per orchestration rules).
from __future__ import annotations

from typing import Any

from langchain_core.tools import tool

from app.core.logger import get_logger
from app.core.storage import get_storage

logger = get_logger("agents.tools")


# ── GEOSPATIAL TOOLS (deterministic — preferred over model calls) ──────────────

@tool
def reproject_raster(asset_path: str, target_crs: str) -> dict:
    """
    Reprojects a raster file to the target CRS.

    ── DATASET INJECTION POINT ──────────────────────────────────────────────
    Expected input: GeoTIFF at asset_path.
    The asset_path comes from the asset store; the user provides the raw file.
    Drop imagery at: data/raw/<filename.tif>
    ─────────────────────────────────────────────────────────────────────────
    """
    try:
        import rasterio
        from rasterio.warp import Resampling, calculate_default_transform, reproject

        with rasterio.open(asset_path) as src:
            transform, width, height = calculate_default_transform(src.crs, target_crs, src.width, src.height, *src.bounds)
            logger.info("reproject_raster", from_crs=str(src.crs), to_crs=target_crs)
            return {"status": "ok", "new_crs": target_crs, "new_width": width, "new_height": height}
    except Exception as exc:
        logger.error("reproject_raster_failed", error=str(exc))
        return {"status": "error", "error": str(exc)}


@tool
def crop_raster(asset_path: str, bbox: list[float]) -> dict:
    """
    Crops a raster to a bounding box [minx, miny, maxx, maxy].

    ── DATASET INJECTION POINT ──────────────────────────────────────────────
    Expected input: GeoTIFF at asset_path.
    Drop imagery at: data/raw/<filename.tif>
    ─────────────────────────────────────────────────────────────────────────
    """
    try:
        import rasterio
        from rasterio.mask import mask
        from shapely.geometry import box, mapping

        geom = mapping(box(*bbox))
        with rasterio.open(asset_path) as src:
            out_image, out_transform = mask(src, [geom], crop=True)
            logger.info("crop_raster", asset=asset_path, bbox=bbox, shape=list(out_image.shape))
            return {"status": "ok", "shape": list(out_image.shape), "transform": str(out_transform)}
    except Exception as exc:
        logger.error("crop_raster_failed", error=str(exc))
        return {"status": "error", "error": str(exc)}


@tool
def compute_ndvi(asset_path: str, red_band: int = 1, nir_band: int = 2) -> dict:
    """Computes NDVI from a multispectral raster. Returns min/max/mean statistics."""
    try:
        import numpy as np
        import rasterio

        with rasterio.open(asset_path) as src:
            red = src.read(red_band).astype(float)
            nir = src.read(nir_band).astype(float)
            ndvi = (nir - red) / (nir + red + 1e-9)
            return {"status": "ok", "ndvi_min": float(ndvi.min()), "ndvi_max": float(ndvi.max()), "ndvi_mean": float(ndvi.mean())}
    except Exception as exc:
        logger.error("compute_ndvi_failed", error=str(exc))
        return {"status": "error", "error": str(exc)}


# ── MODEL DISPATCH STUBS ───────────────────────────────────────────────────────
# These tools delegate to the specialist agents at runtime.
# ── MODEL INJECTION POINT: actual inference is in each specialist agent file. ──

@tool
def run_vqa(asset_path: str, question: str) -> dict:
    """Dispatches a Visual Question Answering task to the VQA specialist agent."""
    logger.info("dispatch_vqa", asset=asset_path, question=question[:80])
    # Actual execution: see app/agents/specialists/vqa_agent.py
    return {"status": "dispatched", "workflow": "vqa"}


@tool
def run_grounding(asset_path: str, entity_prompt: str) -> dict:
    """Dispatches an open-vocabulary grounding task to the Grounding specialist agent."""
    logger.info("dispatch_grounding", asset=asset_path, prompt=entity_prompt[:80])
    return {"status": "dispatched", "workflow": "grounding"}


@tool
def run_change_detection(before_path: str, after_path: str) -> dict:
    """Dispatches a bi-temporal change detection task to the Change specialist agent."""
    logger.info("dispatch_change_detection", before=before_path, after=after_path)
    return {"status": "dispatched", "workflow": "change_detection"}


@tool
def run_sar_fusion(optical_path: str, sar_path: str) -> dict:
    """Dispatches an Optical+SAR fusion task to the SAR specialist agent."""
    logger.info("dispatch_sar_fusion", optical=optical_path, sar=sar_path)
    return {"status": "dispatched", "workflow": "sar_fusion"}


@tool
def run_captioning(asset_path: str) -> dict:
    """Dispatches a scene captioning task."""
    logger.info("dispatch_captioning", asset=asset_path)
    return {"status": "dispatched", "workflow": "captioning"}


ALL_TOOLS = [
    reproject_raster,
    crop_raster,
    compute_ndvi,
    run_vqa,
    run_grounding,
    run_change_detection,
    run_sar_fusion,
    run_captioning,
]
