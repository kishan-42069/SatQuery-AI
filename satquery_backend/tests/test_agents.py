"""
Unit tests for Specialist Agents (Grounding, Change Detection, VQA, Report).
"""

import pytest
from app.agents.change_agent import ChangeDetectionAgent
from app.agents.grounding_agent import GroundingAgent
from app.agents.report_agent import ReportAgent
from app.agents.schemas import OrchestratorPlan
from app.agents.vqa_agent import VQAAgent
from app.ai.gemini_client import GeminiVisionClient
from app.geospatial.coordinate_transform import CoordinateTransformer
from app.geospatial.preview_generator import generate_rgb_preview
from app.geospatial.raster_handler import extract_raster_metadata


@pytest.mark.asyncio
async def test_change_detection_agent(sample_geotiff_pair, tmp_path):
    img1_path, img2_path = sample_geotiff_pair
    prev1 = generate_rgb_preview(img1_path, tmp_path / "p1.png")
    prev2 = generate_rgb_preview(img2_path, tmp_path / "p2.png")
    meta = extract_raster_metadata(img1_path)

    transformer = CoordinateTransformer(
        width=meta.width,
        height=meta.height,
        affine_transform=meta.transform,
        crs_str=meta.crs_str,
        crs_epsg=meta.crs_epsg,
    )

    client = GeminiVisionClient()
    agent = ChangeDetectionAgent(vision_client=client)

    res = await agent.execute(
        query="What's the difference between the two?",
        image_1_preview_path=str(prev1),
        image_2_preview_path=str(prev2),
        coord_transformer=transformer,
    )

    assert res.status == "success"
    assert res.changes_detected is True
    assert len(res.change_regions) > 0
    assert len(res.visualization_geojson.features) > 0
    assert res.change_regions[0].geojson_feature is not None


@pytest.mark.asyncio
async def test_grounding_agent(sample_geotiff_pair, tmp_path):
    # Use image 2 which contains the built structure cluster
    _, img2_path = sample_geotiff_pair
    prev2 = generate_rgb_preview(img2_path, tmp_path / "p2.png")
    meta = extract_raster_metadata(img2_path)

    transformer = CoordinateTransformer(
        width=meta.width,
        height=meta.height,
        affine_transform=meta.transform,
        crs_str=meta.crs_str,
        crs_epsg=meta.crs_epsg,
    )

    client = GeminiVisionClient()
    agent = GroundingAgent(vision_client=client)

    res = await agent.execute(
        query="Find all prominent structures and high reflectance features.",
        image_preview_path=str(prev2),
        coord_transformer=transformer,
    )

    assert res.status == "success"
    assert res.total_detected >= 0
    assert isinstance(res.findings, list)


@pytest.mark.asyncio
async def test_report_agent(sample_geotiff_pair, tmp_path):
    img1_path, img2_path = sample_geotiff_pair
    prev1 = generate_rgb_preview(img1_path, tmp_path / "p1.png")
    prev2 = generate_rgb_preview(img2_path, tmp_path / "p2.png")
    meta = extract_raster_metadata(img1_path)

    transformer = CoordinateTransformer(
        width=meta.width,
        height=meta.height,
        affine_transform=meta.transform,
        crs_str=meta.crs_str,
        crs_epsg=meta.crs_epsg,
    )

    client = GeminiVisionClient()
    change_agent = ChangeDetectionAgent(client)
    change_res = await change_agent.execute(
        query="What's the difference?",
        image_1_preview_path=str(prev1),
        image_2_preview_path=str(prev2),
        coord_transformer=transformer,
    )

    report_agent = ReportAgent(client)
    plan = OrchestratorPlan(workflow="change_detection", reasoning="Temporal diff")
    rep = await report_agent.execute(
        query="What's the difference?",
        plan=plan,
        specialist_result=change_res,
        metadata={"image_1": meta.to_dict()},
    )

    assert rep.status == "success"
    assert len(rep.executive_summary) > 10
    assert len(rep.key_findings) > 0
