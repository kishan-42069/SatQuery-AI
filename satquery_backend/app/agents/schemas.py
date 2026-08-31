"""
Standard Pydantic schemas and result types for SatQuery AI Agent Architecture.
"""

from typing import Any, Dict, List, Optional, Union
from pydantic import BaseModel, Field


class PixelBoundingBox(BaseModel):
    col_min: float
    row_min: float
    col_max: float
    row_max: float
    width: float
    height: float


class GeoJSONGeometry(BaseModel):
    type: str = "Polygon"
    coordinates: List[List[List[float]]]  # [[[lon, lat], ...]]


class GeoJSONFeature(BaseModel):
    type: str = "Feature"
    geometry: GeoJSONGeometry
    properties: Dict[str, Any] = Field(default_factory=dict)


class GeoJSONFeatureCollection(BaseModel):
    type: str = "FeatureCollection"
    features: List[GeoJSONFeature] = Field(default_factory=list)


class OrchestratorPlan(BaseModel):
    workflow: str  # 'change_detection', 'grounding', 'vqa', 'multimodal_sar_optical'
    reasoning: str
    target_features: List[str] = Field(default_factory=list)
    comparison_mode: bool = False
    confidence: float = 1.0


class SpecialistFinding(BaseModel):
    finding_id: str
    label: str
    confidence: float
    description: str
    pixel_bbox: Optional[Dict[str, float]] = None
    geojson_feature: Optional[GeoJSONFeature] = None
    extra_properties: Dict[str, Any] = Field(default_factory=dict)


class GroundingResult(BaseModel):
    status: str = "success"
    agent: str = "GroundingAgent"
    total_detected: int
    summary: str
    findings: List[SpecialistFinding]
    visualization_geojson: GeoJSONFeatureCollection


class ChangeRegion(BaseModel):
    region_id: str
    change_type: str
    confidence: float
    before_state: str
    after_state: str
    description: str
    pixel_bbox: Optional[Dict[str, float]] = None
    geojson_feature: Optional[GeoJSONFeature] = None


class ChangeDetectionResult(BaseModel):
    status: str = "success"
    agent: str = "ChangeDetectionAgent"
    changes_detected: bool
    overall_change_level: str
    summary: str
    change_regions: List[ChangeRegion]
    visualization_geojson: GeoJSONFeatureCollection


class VQAResult(BaseModel):
    status: str = "success"
    agent: str = "VQAAgent"
    answer: str
    confidence: float
    scene_classification: Optional[str] = None
    supporting_findings: List[SpecialistFinding] = Field(default_factory=list)
    visualization_geojson: GeoJSONFeatureCollection


class ReportResult(BaseModel):
    status: str = "success"
    agent: str = "ReportAgent"
    executive_summary: str
    key_findings: List[str]
    spatial_impact: str
    confidence_assessment: str
    recommendations: List[str]


class AnalysisResponse(BaseModel):
    status: str = "success"
    job_id: str
    query: str
    orchestrator_plan: OrchestratorPlan
    analysis: Dict[str, Any]
    visualization: GeoJSONFeatureCollection
    report: ReportResult
    metadata: Dict[str, Any]
    execution_trace: List[Dict[str, Any]]
