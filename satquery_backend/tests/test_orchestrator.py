"""
Unit tests for Orchestrator Agent intent planning and routing.
"""

import pytest
from app.agents.orchestrator import OrchestratorAgent
from app.geospatial.preview_generator import generate_rgb_preview
from app.geospatial.raster_handler import extract_raster_metadata


@pytest.mark.asyncio
async def test_orchestrator_planning(sample_geotiff_pair, tmp_path):
    img1_path, img2_path = sample_geotiff_pair
    prev1 = generate_rgb_preview(img1_path, tmp_path / "p1.png")
    prev2 = generate_rgb_preview(img2_path, tmp_path / "p2.png")

    orchestrator = OrchestratorAgent()

    # Case 1: Bi-temporal change detection query with two images
    plan_change = await orchestrator.plan_workflow(
        query="What's the difference between the two?",
        has_dual_images=True,
        image_previews=[str(prev1), str(prev2)],
    )
    assert plan_change.workflow == "change_detection"
    assert plan_change.comparison_mode is True

    # Case 2: Grounding query with single image
    plan_grounding = await orchestrator.plan_workflow(
        query="Find all buildings and structures in this scene.",
        has_dual_images=False,
        image_previews=[str(prev1)],
    )
    assert plan_grounding.workflow == "grounding"

    # Case 3: VQA query
    plan_vqa = await orchestrator.plan_workflow(
        query="What type of land cover is shown?",
        has_dual_images=False,
        image_previews=[str(prev1)],
    )
    assert plan_vqa.workflow in ["vqa", "grounding"]
