"""
VQA Agent: Visual Question Answering and scene understanding in Earth Observation imagery.
"""

import uuid
from typing import Any, Dict, List
from app.agents.schemas import (
    GeoJSONFeature,
    GeoJSONFeatureCollection,
    GeoJSONGeometry,
    SpecialistFinding,
    VQAResult,
)
from app.ai.gemini_client import GeminiVisionClient
from app.ai.prompts import VQA_PROMPT
from app.core.logging_config import logger
from app.geospatial.coordinate_transform import CoordinateTransformer


class VQAAgent:
    """
    Interprets natural language inquiries about scene contents, infrastructure,
    land cover, and spatial phenomena.
    """

    def __init__(self, vision_client: GeminiVisionClient):
        self.vision_client = vision_client

    async def execute(
        self,
        query: str,
        image_preview_path: str,
        coord_transformer: CoordinateTransformer,
        job_id: str = "SYSTEM",
    ) -> VQAResult:
        logger.info(f"[{job_id}] VQAAgent executing for query: '{query}'")

        full_prompt = f"{VQA_PROMPT}\n\nUSER QUESTION:\n{query}"
        response_json = self.vision_client.generate_json_response(
            prompt=full_prompt,
            images=[image_preview_path],
            job_id=job_id,
        )

        answer = response_json.get("answer", "Visual analysis completed.")
        confidence = float(response_json.get("confidence", 0.90))
        scene_classification = response_json.get("scene_classification", "Earth Observation Scene")
        regions_raw = response_json.get("supporting_regions", [])

        supporting_findings: List[SpecialistFinding] = []
        geojson_features: List[GeoJSONFeature] = []

        for item in regions_raw:
            finding_id = f"vqa_{uuid.uuid4().hex[:8]}"
            label = item.get("label", "Supporting Region")
            box_2d = item.get("box_2d", [100, 100, 400, 400])
            description = item.get("description", "Region answering the query")

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

            supporting_findings.append(
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

        return VQAResult(
            status="success",
            agent="VQAAgent",
            answer=answer,
            confidence=confidence,
            scene_classification=scene_classification,
            supporting_findings=supporting_findings,
            visualization_geojson=collection,
        )
