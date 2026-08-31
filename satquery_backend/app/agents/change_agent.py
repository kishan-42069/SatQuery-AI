"""
Change Detection Agent: Bi-temporal remote-sensing comparative analysis.
"""

import uuid
from typing import Any, Dict, List
from app.agents.schemas import (
    ChangeDetectionResult,
    ChangeRegion,
    GeoJSONFeature,
    GeoJSONFeatureCollection,
    GeoJSONGeometry,
)
from app.ai.gemini_client import GeminiVisionClient
from app.ai.prompts import CHANGE_DETECTION_PROMPT
from app.core.logging_config import logger
from app.geospatial.coordinate_transform import CoordinateTransformer


class ChangeDetectionAgent:
    """
    Compares two temporal GeoTIFF acquisitions (Before & After),
    identifies changes, maps regions to GIS coordinates, and describes dynamics.
    """

    def __init__(self, vision_client: GeminiVisionClient):
        self.vision_client = vision_client

    async def execute(
        self,
        query: str,
        image_1_preview_path: str,
        image_2_preview_path: str,
        coord_transformer: CoordinateTransformer,
        job_id: str = "SYSTEM",
    ) -> ChangeDetectionResult:
        logger.info(f"[{job_id}] ChangeDetectionAgent executing bi-temporal comparison for query: '{query}'")

        full_prompt = (
            f"{CHANGE_DETECTION_PROMPT}\n\n"
            f"USER QUERY:\n{query}\n\n"
            f"Image 1 represents Reference (T1 / Baseline). Image 2 represents Target (T2 / Subsequent)."
        )

        response_json = self.vision_client.generate_json_response(
            prompt=full_prompt,
            images=[image_1_preview_path, image_2_preview_path],
            job_id=job_id,
        )

        changes_detected = bool(response_json.get("changes_detected", True))
        overall_change_level = response_json.get("overall_change_level", "significant")
        summary = response_json.get(
            "summary",
            "Bi-temporal satellite analysis completed. Significant changes detected in target sector."
        )
        regions_raw = response_json.get("change_regions", [])

        change_regions: List[ChangeRegion] = []
        geojson_features: List[GeoJSONFeature] = []

        for item in regions_raw:
            reg_id = f"chg_{uuid.uuid4().hex[:8]}"
            change_type = item.get("change_type", "Detected Surface Change")
            box_2d = item.get("box_2d", [100, 100, 500, 500])
            confidence = float(item.get("confidence", 0.90))
            before_state = item.get("before_state", "Baseline terrain state")
            after_state = item.get("after_state", "Modified surface state")
            description = item.get("description", f"Change detected: {change_type}")

            feature_dict = coord_transformer.transform_box_to_geojson(
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

            geojson_feat = GeoJSONFeature(
                type="Feature",
                geometry=GeoJSONGeometry(
                    type="Polygon",
                    coordinates=feature_dict["geometry"]["coordinates"],
                ),
                properties=feature_dict["properties"],
            )

            geojson_features.append(geojson_feat)

            change_regions.append(
                ChangeRegion(
                    region_id=reg_id,
                    change_type=change_type,
                    confidence=confidence,
                    before_state=before_state,
                    after_state=after_state,
                    description=description,
                    pixel_bbox=feature_dict["properties"]["pixel_bbox"],
                    geojson_feature=geojson_feat,
                )
            )

        collection = GeoJSONFeatureCollection(
            type="FeatureCollection", features=geojson_features
        )

        return ChangeDetectionResult(
            status="success",
            agent="ChangeDetectionAgent",
            changes_detected=changes_detected,
            overall_change_level=overall_change_level,
            summary=summary,
            change_regions=change_regions,
            visualization_geojson=collection,
        )
