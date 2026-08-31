# SatQuery AI - Backend Integration
**SIH 2026 Problem Statement 26167 | Indian Space Research Organisation (ISRO)**  
*Interactive Vision-Language Assistant for Multimodal Remote Sensing Image Analysis through Natural Language Queries*

---

## 🛰️ Architecture Overview

SatQuery AI orchestrates multi-modal remote-sensing workflows through specialist agent routing, vision-language model (Gemini VLM) reasoning, and geospatial coordinate transformation:

```
User Upload (Two GeoTIFFs + Query)
                │
                ▼
      FastAPI API Endpoint (/api/v1/analyze)
                │
    ┌───────────┴───────────┐
    ▼                       ▼
Format & Security Validation   Geospatial Ingestion Engine (Rasterio)
- Magic bytes verification     - CRS, Affine Matrix, Bounding Box
- Size limits & sanitize       - Multi-band percentile stretch -> RGB
    │                       │
    └───────────┬───────────┘
                ▼
        Orchestrator Agent
  (Intent Classification & Workflow Selection)
                │
   ┌────────────┼────────────┬─────────────┐
   ▼            ▼            ▼             ▼
Change Agent Grounding Agent VQA Agent  SAR/Optical Fusion
(Bi-temporal (Spatial feature (Visual QA  (Cross-modal joint
 difference)  localization)   reasoning)   interpretation)
   │            │            │             │
   └────────────┼────────────┴─────────────┘
                ▼
    Gemini VLM / AI Inference Engine (google-genai)
                │
                ▼
  Geospatial Coordinate Transformer
  - Image Pixel Coordinates [ymin, xmin, ymax, xmax]
  - Affine Transform Matrix
  - Geographic/Projected Coordinates -> GeoJSON (WGS84 EPSG:4326)
                │
                ▼
           Report Agent
  - Multi-Agent Evidence Synthesis
  - Confidence Assessment & Sensor Provenance
  - Operational Recommendations & Executive Briefing
                │
                ▼
  Resilient Database Persistence (SQLite/aiosqlite)
                │
                ▼
  Structured API Response & Raw HTML/JS Verification UI (/test)
```

---

## 🚀 Quickstart Guide

### 1. Requirements
- Python 3.9+
- Dependencies installed via `pip install -r requirements.txt`

### 2. Configuration
Copy the sample environment file:
```bash
cp .env.example .env
```
Optionally configure your Gemini API Key in `.env`:
```env
GEMINI_API_KEY=AIzaSy...
GEMINI_MODEL=gemini-2.5-flash
```
*(Note: If `GEMINI_API_KEY` is not provided, the backend operates in deterministic heuristic offline mode with full geospatial raster math, ensuring tests and demo runs never fail.)*

### 3. Generate Sample GeoTIFF Test Dataset
```bash
python3 scripts/generate_sample_geotiffs.py
```
This generates:
- `sample_data/isro_optical_2022.tif` (Before - baseline vegetation, UTM EPSG:32643)
- `sample_data/isro_optical_2026.tif` (After - urban growth in NE quadrant, UTM EPSG:32643)
- `sample_data/isro_sar_2026.tif` (Dual-band VV/VH SAR imagery)

### 4. Run the Backend Server
```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### 5. Open the Test Interface
Navigate to:
```
http://127.0.0.1:8000/test
```
*(Built using raw HTML and pure JavaScript without CSS for demonstration testing.)*

### 6. Run the Test Suite
```bash
python3 -m pytest tests/ -v
```

---

## 📡 API Contract Reference

### `POST /api/v1/analyze`
Accepts `image_1` (GeoTIFF), optional `image_2` (GeoTIFF), and `query` (string).

#### Example Response:
```json
{
  "status": "success",
  "job_id": "job_1709a19807",
  "query": "What's the difference between the two?",
  "orchestrator_plan": {
    "workflow": "change_detection",
    "reasoning": "Temporal bi-temporal comparison detected from query context and dual image inputs.",
    "target_features": ["land-use change", "urban expansion", "vegetation shift"],
    "comparison_mode": true,
    "confidence": 0.95
  },
  "analysis": {
    "status": "success",
    "agent": "ChangeDetectionAgent",
    "changes_detected": true,
    "overall_change_level": "significant",
    "summary": "The selected area has undergone significant changes between temporal acquisitions...",
    "change_regions": [
      {
        "region_id": "chg_e182390a",
        "change_type": "Surface Transformation & Development",
        "confidence": 0.96,
        "before_state": "Baseline terrain state in North-Eastern Sector.",
        "after_state": "Significant reflectance and structural change observed in North-Eastern Sector.",
        "description": "Concentrated alteration detected...",
        "pixel_bbox": {
          "col_min": 266.24,
          "row_min": 25.6,
          "col_max": 486.4,
          "row_max": 245.76,
          "width": 220.16,
          "height": 220.16
        }
      }
    ]
  },
  "visualization": {
    "type": "FeatureCollection",
    "features": [
      {
        "type": "Feature",
        "geometry": {
          "type": "Polygon",
          "coordinates": [
            [
              [72.204407, 17.209368],
              [72.225385, 17.209368],
              [72.225385, 17.189777],
              [72.204407, 17.189777],
              [72.204407, 17.209368]
            ]
          ]
        },
        "properties": {
          "label": "Surface Transformation & Development",
          "confidence": 0.96,
          "is_georeferenced": true,
          "native_crs": 32643
        }
      }
    ]
  },
  "report": {
    "status": "success",
    "agent": "ReportAgent",
    "executive_summary": "The selected area has undergone significant changes between temporal acquisitions. The major changes are concentrated in the northern and eastern portions of the image.",
    "key_findings": [
      "Bi-temporal satellite reflectance comparison confirms substantial land surface alteration.",
      "Geospatial reference transformation verified coordinate alignment.",
      "Changes show high concentration in designated geographic sectors."
    ],
    "spatial_impact": "Localized modifications concentrated in the active visual sectors.",
    "confidence_assessment": "High analytical confidence backed by deterministic geospatial projection.",
    "recommendations": [
      "Review highlighted GeoJSON bounding coordinates on the GIS map layer.",
      "Verify temporal interval and sensor calibration for follow-up acquisitions."
    ]
  },
  "metadata": {
    "image_1": {
      "dimensions": {"width": 512, "height": 512, "bands": 3},
      "crs": {"epsg": 32643, "wkt": "EPSG:32643"}
    }
  },
  "execution_trace": [
    {"step": "Geospatial Alignment & Coordinate Transformer Initialization", "agent": "GeospatialEngine", "status": "success", "duration_ms": 8.23},
    {"step": "Query Analysis & Workflow Selection", "agent": "OrchestratorAgent", "status": "success", "duration_ms": 0.07},
    {"step": "Bi-temporal Change Detection & Feature Localization", "agent": "ChangeDetectionAgent", "status": "success", "duration_ms": 6.90},
    {"step": "Multi-Agent Evidence & Executive Report Synthesis", "agent": "ReportAgent", "status": "success", "duration_ms": 0.04}
  ]
}
```
