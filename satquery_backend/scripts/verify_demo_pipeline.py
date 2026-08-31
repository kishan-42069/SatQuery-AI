"""
Verification script demonstrating the end-to-end SatQuery AI workflow:
Accepts two GeoTIFFs + query -> Orchestrator -> Specialist Agents -> Coordinates -> Executive Report.
"""

import asyncio
import json
from pathlib import Path
from httpx import ASGITransport, AsyncClient
from app.main import app

async def run_verification():
    print("=" * 60)
    print("SATQUERY AI: BI-TEMPORAL DEMO WORKFLOW VERIFICATION")
    print("SIH 2026 Problem Statement 26167 (ISRO)")
    print("=" * 60)

    p1 = Path("sample_data/isro_optical_2022.tif")
    p2 = Path("sample_data/isro_optical_2026.tif")
    query = "What's the difference between the two?"

    print(f"\n[1] Input Image 1: {p1} ({p1.stat().st_size} bytes)")
    print(f"[1] Input Image 2: {p2} ({p2.stat().st_size} bytes)")
    print(f"[1] Natural Language Query: \"{query}\"")

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Check Health
        h_res = await client.get("/api/v1/health")
        print(f"\n[2] System Health Check: {h_res.status_code}")
        print(f"    VLM Mode: {h_res.json()['gemini_vlm']['mode']}")
        print(f"    Target CRS: {h_res.json()['geospatial_engine']['target_crs']}")

        # Execute Dual-GeoTIFF Analysis
        print("\n[3] Sending Multi-Modal Analysis Request to /api/v1/analyze...")
        with open(p1, "rb") as f1, open(p2, "rb") as f2:
            res = await client.post(
                "/api/v1/analyze",
                files={
                    "image_1": ("isro_optical_2022.tif", f1, "image/tiff"),
                    "image_2": ("isro_optical_2026.tif", f2, "image/tiff"),
                },
                data={
                    "query": query,
                    "session_id": "sih_isro_demo_live"
                }
            )

        print(f"\n[4] Response Status Code: {res.status_code}")
        if res.status_code != 200:
            print(f"Error: {res.text}")
            return

        data = res.json()
        print("\n[5] Orchestrator Plan:")
        print(f"    - Workflow: {data['orchestrator_plan']['workflow']}")
        print(f"    - Reasoning: {data['orchestrator_plan']['reasoning']}")
        print(f"    - Confidence: {data['orchestrator_plan']['confidence']}")

        print("\n[6] Specialist Analysis Summary:")
        print(f"    - Changes Detected: {data['analysis'].get('changes_detected')}")
        print(f"    - Change Level: {data['analysis'].get('overall_change_level')}")
        print(f"    - Specialist Summary: {data['analysis'].get('summary')}")
        print(f"    - Detected Regions: {len(data['analysis'].get('change_regions', []))} areas")

        print("\n[7] GeoJSON Coordinates (WGS84 EPSG:4326):")
        for i, feat in enumerate(data['visualization']['features'], 1):
            props = feat['properties']
            coords = feat['geometry']['coordinates'][0]
            print(f"    Region {i}: {props.get('label')} (Confidence: {props.get('confidence')})")
            print(f"      Pixel Bounding Box: {props.get('pixel_bbox')}")
            print(f"      WGS84 Polygon Ring (Top-Left / Bottom-Right):")
            print(f"        TL: [{coords[0][0]:.6f}, {coords[0][1]:.6f}] | BR: [{coords[2][0]:.6f}, {coords[2][1]:.6f}]")

        print("\n[8] Executive Report (Report Agent Synthesis):")
        print(f"    Executive Summary:\n      \"{data['report']['executive_summary']}\"")
        print("    Key Findings:")
        for kf in data['report']['key_findings']:
            print(f"      * {kf}")
        print(f"    Spatial Impact: {data['report']['spatial_impact']}")

        print("\n[9] Agent Execution Trace:")
        for t in data['execution_trace']:
            print(f"    [{t['agent']}] {t['step']} -> {t['status']} ({t['duration_ms']}ms)")

        print("\n" + "=" * 60)
        print("PIPELINE DEMONSTRATION VERIFIED END-TO-END SUCCESSFULLY")
        print("=" * 60)

if __name__ == "__main__":
    asyncio.run(run_verification())
