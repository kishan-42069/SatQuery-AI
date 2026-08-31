"""
Grounding Agent: Spatial feature localization in remote-sensing imagery.
"""

import uuid
from typing import Any, Dict, List
from app.agents.schemas import (
    GeoJSONFeature,
    GeoJSONFeatureCollection,
    GeoJSONGeometry,
    GroundingResult,
    SpecialistFinding,
)
from app.ai.gemini_client import GeminiVisionClient
from app.ai.prompts import GROUNDING_PROMPT
from app.core.logging_config import logger
from app.geospatial.coordinate_transform import CoordinateTransformer


class GroundingAgent:
    """
    Identifies target entities from query, locates them in image pixel space,
    and maps them to geospatial coordinates.
    """

    def __init__(self, vision_client: GeminiVisionClient):
        self.vision_client = vision_client

    async def execute(
        self,
        query: str,
        image_preview_path: str,
        coord_transformer: CoordinateTransformer,
        job_id: str = "SYSTEM",
    ) -> GroundingResult:
        logger.info(f"[{job_id}] GroundingAgent executing for query: '{query}'")

        full_prompt = f"{GROUNDING_PROMPT}\n\nUSER QUERY:\n{query}"
        response_json = self.vision_client.generate_json_response(
            prompt=full_prompt,
            images=[image_preview_path],
            job_id=job_id,
        )

        findings_raw = response_json.get("findings", [])
        total_detected = response_json.get("total_detected", len(findings_raw))
        summary = response_json.get("summary", "Grounding analysis completed.")

        specialist_findings: List[SpecialistFinding] = []
        geojson_features: List[GeoJSONFeature] = []

        for item in findings_raw:
            finding_id = f"fnd_{uuid.uuid4().hex[:8]}"
            label = item.get("label", "Detected Feature")
            box_2d = item.get("box_2d", [0, 0, 100, 100])
            confidence = float(item.get("confidence", 0.90))
            description = item.get("description", f"Localized region for {label}")

            feature_dict = coord_transformer.transform_box_to_geojson(
                box=box_2d,
                label=label,
                confidence=confidence,
                properties={"finding_id": finding_id, "description": description},
            )

            geojson_feat = GeoJSONFeature(
                type="Feature",
                geometry=GeoJSONGeometry(
                    type="Polygon",
                    coordinates=feature_dict["geometry"]["coordinates"],
                ),
                properties=feature_dict["properties"],
            )

            geojson_features.append(geojson_feat)

            specialist_findings.append(
                SpecialistFinding(
                    finding_id=finding_id,
                    label=label,
                    confidence=confidence,
                    description=description,
                    pixel_bbox=feature_dict["properties"]["pixel_bbox"],
                    geojson_feature=geojson_feat,
                )
            )

        collection = GeoJSONFeatureCollection(
            type="FeatureCollection", features=geojson_features
        )

        return GroundingResult(
            status="success",
            agent="GroundingAgent",
            total_detected=total_detected,
            summary=summary,
            findings=specialist_findings,
            visualization_geojson=collection,
        )
