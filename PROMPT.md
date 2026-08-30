SatQuery AI - Backend Implementation Brief
You are a backend development team tasked with building the production-grade backend system for SatQuery AI, an agentic AI-powered vision-language assistant for remote-sensing imagery.

Your goal is to build the entire backend architecture, API layer, agent orchestration, and data models based on the specifications below. A separate frontend team will handle the UI.

1. Core System Architecture
The backend architecture consists of several specialized layers working in concert:

API / Session Layer: Handles authentication, API requests, session management, and job lifecycle. Acts as the orchestration entrypoint.
Agent Runtime: Manages planning, tool calling, state management, and execution traces.
AI Inference Layer: Executes specialized computer vision tasks including VLM processing, VQA, grounding, segmentation, and change detection.
Geospatial Layer: Manages Raster IO, projections, geometry, and spatial analysis operations.
Data Layer: Stores metadata, spatial indices, and session state.
Storage Layer: Manages original uploads, generated tiles, intermediate outputs, and final reports.
Data Flow
Ingestion: IMAGE / METADATA $\rightarrow$ VALIDATE $\rightarrow$ NORMALIZE $\rightarrow$ TILE / PREPROCESS
Orchestration: AGENT TOOL SELECTION $\rightarrow$ MODEL / GIS EXECUTION
Output: STRUCTURED OUTPUTS $\rightarrow$ EVIDENCE + CONFIDENCE $\rightarrow$ UI + EXPORT
2. API Integration Points
The specific API contracts and endpoints will be provided to you manually. Your task is to set up the foundation and routing logic in FastAPI so these can be easily plugged in.

Please prepare the following integration areas within your FastAPI application structure (e.g., in a routers/ or controllers/ directory):

Asset Management Router: Prepare a module to handle image ingestion, format validation, and metadata extraction (FR-001, FR-002).
Session & Query Router: Prepare a module for asynchronous query processing, maintaining session context (FR-012), and triggering the orchestrator (FR-003, FR-004). Set up the foundation for WebSockets or polling mechanisms for real-time streaming of agent traces.
Specialist Workflows Router: Set up the routing where the orchestrator will return results for VQA, Captioning, Grounding, Change Detection, and Optical+SAR analysis (FR-005 to FR-009).
Reporting & Export Router: Prepare endpoints to retrieve structured analysis summaries and generated evidence (FR-010, FR-011, FR-014).
When the API specifications are handed to you, implement them within these prepared modules, ensuring graceful failure handling for unsupported modalities, low-confidence results, or tool failures (FR-015).

3. Agent Orchestration & Workflows
The agentic layer is the core differentiator. Implement this using LangGraph.

The Orchestrator / Planner
Receives user requests and available inputs.
Decomposes the task and selects the appropriate specialist workflow.
Requires validation before final synthesis for high-uncertainty tasks.
Must record a machine-readable trace of steps for debugging and UI explainability.
Specialist Agents
VQA Agent: Answers image-grounded questions. Returns answer + supporting region.
Grounding Agent: Finds requested entities/regions. Returns bounding boxes/masks + confidence.
Change Agent: Analyzes bi-temporal differences. Returns change map + change classes.
SAR / Multimodal Agent: Combines SAR with optical context for joint interpretation.
Evidence Agent: Checks provenance and composes traceable evidence.
Report Agent: Turns outputs into a structured user-facing summary.
Orchestration Rules
Prefer deterministic geospatial operations (geometry, reprojection, masking) over model calls when possible.
Pass structured intermediate outputs between agents.
Keep image evidence and metadata attached to intermediate results.
4. Data Model & Schema
Implement a robust relational database schema using PostgreSQL + PostGIS.

Core Entities
Session: session_id, user_id, state, timestamps
ImageAsset: asset_id, URI/path, modality, CRS, bbox (PostGIS Geography/Geometry), acquisition_time
Query: query_id, session_id, text, referenced_assets
AnalysisRun: run_id, plan, tools_used, status, duration
Finding: finding_id, geometry/region (PostGIS), label, confidence, evidence_refs
ModelRun: model_id, version, input_refs, output_refs, metrics
Report: report_id, run_id, summary, evidence, export_uri
Data Handling Principles
Preserve original input assets separately from derived products.
Make every finding traceable to a model run and source asset.
Store spatial metadata explicitly (do not infer from UI state).
Use PostGIS for spatial queries and indexing.
5. Technology Stack & Dependencies
Strict adherence to the following stack is required:

API & Backend: Python + FastAPI
Agent Framework: LangGraph
AI Inference: PyTorch, Transformers (Hugging Face)
Computer Vision: OpenCV
Geospatial / GIS: GDAL, Rasterio, GeoPandas, Shapely
Database: PostgreSQL with PostGIS extension
Cache & Job Queues: Redis (for ephemeral jobs, caching, and session coordination)
Storage: Local filesystem or Object Storage (S3-compatible) for MVP
Packaging: Docker for reproducible environments
Note: Models should be pinned to specific versions for evaluation reproducibility.

6. Security & Validation
Input Validation: Validate all uploaded files (format, size, metadata) before processing.
Prompt Injection Defense: Treat natural-language input as untrusted. Sanitize and defend against prompt injection or malicious tool arguments.
Path Traversal: Restrict file paths and tool inputs to approved directories or object-storage URIs.
Secret Management: Protect secrets and API keys using strict environment-based secret management.
Access Control: Apply access controls to sessions and stored assets.
Data Privacy: Log tool calls and model versions for debugging, but ensure sensitive user data is not exposed unnecessarily in logs.
7. MVP Scope (What to Build Now)
Focus strictly on the following MVP features. Do not build advanced features yet.

Dataset Handling
All datasets (satellite imagery, SAR data, annotation files, metadata CSVs, etc.) will be provided manually by the user. Do NOT write any dataset fetching, scraping, or auto-download logic.

Instead, clearly mark every location in the codebase where a dataset or file input is expected using a placeholder comment block like this:

python

# ── DATASET INJECTION POINT ──────────────────────────────────────────────
# The user will provide the dataset/file here manually.
# Expected input: <describe what type of file/data goes here, e.g., GeoTIFF, CSV>
# Drop the file at: <suggest a relative path like `data/raw/input_image.tif`>
# ─────────────────────────────────────────────────────────────────────────
Apply this pattern in every module that loads imagery, ground truth, reference data, or model weights.

In Scope for MVP:

Image upload and metadata extraction. (Dataset injection point: image loader module)
Natural language querying.
Single-image VQA. (Dataset injection point: image loader)
Scene captioning. (Dataset injection point: image loader)
Open-vocabulary grounding. (Dataset injection point: image + label prompt)
Bi-temporal change detection. (Dataset injection point: before & after image loaders)
Optical + SAR fusion. (Dataset injection point: optical image loader + SAR image loader)
Session-level conversational memory.
Minimal agent explainability (trace outputs).
Report export (brief generation).
Deferred to Post-MVP (DO NOT BUILD):

Batch ingestion or automatic remote catalogue search.
Complex multi-query planning.
Long time-series / multi-temporal trend analysis.
Persistent analyst workspaces.
Active-learning loops / user corrections.
Dynamic model routing based on cost/latency.
8. Non-Functional Requirements
Performance Tracking: Record latency (p50 / p95 end-to-end time) and memory use alongside accuracy for all model/agent runs.
Failure Recovery: The system must recover gracefully from top failure modes (missing metadata, unsupported modality, noisy imagery, model disagreement) without crashing the session.
Caching: Cache representative demo data locally to ensure API/data stability during presentations. Use Redis heavily for job queuing and intermediate state.
Deterministic Demos: For the SIH demo, the pipeline must feel deterministic. Pre-cache imagery and model weights.
Traceability: Build the pipeline to ensure that every important claim has an obvious evidence affordance. Never present uncertainty as certainty.
