"""
End-to-End API endpoint integration tests for SatQuery AI.
"""

import io
import pytest
from httpx import ASGITransport, AsyncClient
from app.main import app


@pytest.mark.asyncio
async def test_health_endpoint():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        response = await ac.get("/api/v1/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "online"
        assert "gemini_vlm" in data
        assert "geospatial_engine" in data
        assert "database" in data


@pytest.mark.asyncio
async def test_asset_upload(sample_geotiff_pair):
    img1_path, _ = sample_geotiff_pair
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        with open(img1_path, "rb") as f:
            response = await ac.post(
                "/api/v1/assets/upload",
                files={"file": ("sample1.tif", f, "image/tiff")},
                data={"session_id": "test_session"},
            )
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        assert "asset_id" in data
        assert "metadata" in data
        assert data["metadata"]["dimensions"]["width"] == 256


@pytest.mark.asyncio
async def test_end_to_end_analyze_dual_geotiff(sample_geotiff_pair):
    img1_path, img2_path = sample_geotiff_pair
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        with open(img1_path, "rb") as f1, open(img2_path, "rb") as f2:
            response = await ac.post(
                "/api/v1/analyze",
                files={
                    "image_1": ("sample_before.tif", f1, "image/tiff"),
                    "image_2": ("sample_after.tif", f2, "image/tiff"),
                },
                data={
                    "query": "What's the difference between the two?",
                    "session_id": "test_session_sih2026",
                },
            )

        assert response.status_code == 200
        data = response.json()

        # Verify structured contract
        assert data["status"] == "success"
        assert "job_id" in data
        assert data["query"] == "What's the difference between the two?"
        
        # Verify Orchestrator Plan
        assert data["orchestrator_plan"]["workflow"] == "change_detection"
        assert data["orchestrator_plan"]["comparison_mode"] is True

        # Verify Analysis & Detected Change Regions
        assert "analysis" in data
        assert data["analysis"]["changes_detected"] is True
        assert len(data["analysis"]["change_regions"]) > 0

        # Verify GeoJSON Features
        assert data["visualization"]["type"] == "FeatureCollection"
        assert len(data["visualization"]["features"]) > 0
        feat = data["visualization"]["features"][0]
        assert feat["geometry"]["type"] == "Polygon"
        assert feat["properties"]["is_georeferenced"] is True

        # Verify Executive Report
        assert "report" in data
        assert len(data["report"]["executive_summary"]) > 10
        assert len(data["report"]["key_findings"]) > 0

        # Verify Execution Trace
        assert len(data["execution_trace"]) >= 4


@pytest.mark.asyncio
async def test_invalid_file_rejected():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # Send text file disguised as .tif
        fake_content = b"THIS IS NOT A VALID GEOTIFF HEADER"
        response = await ac.post(
            "/api/v1/analyze",
            files={"image_1": ("fake.tif", io.BytesIO(fake_content), "image/tiff")},
            data={"query": "What's the difference?"},
        )
        assert response.status_code == 400
        assert "not a valid GeoTIFF" in response.json()["detail"]


@pytest.mark.asyncio
async def test_single_geotiff_grounding(sample_geotiff_pair):
    _, img2_path = sample_geotiff_pair
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        with open(img2_path, "rb") as f2:
            response = await ac.post(
                "/api/v1/analyze",
                files={"image_1": ("sample_target.tif", f2, "image/tiff")},
                data={
                    "query": "Find all buildings and structures in this scene.",
                    "session_id": "test_grounding_session",
                },
            )

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        assert data["orchestrator_plan"]["workflow"] == "grounding"
        assert isinstance(data["visualization"]["features"], list)

        # Verify job retrieval via /jobs/{id}
        job_id = data["job_id"]
        job_res = await ac.get(f"/api/v1/analyze/jobs/{job_id}")
        assert job_res.status_code == 200
        job_data = job_res.json()
        assert job_data["job_id"] == job_id
        assert job_data["status"] == "completed"
