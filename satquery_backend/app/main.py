"""
SatQuery AI - FastAPI Application Entry Point.
SIH 2026 Problem Statement 26167 (ISRO)
"""

from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from app.api.routes.analysis import router as analysis_router
from app.api.routes.assets import router as assets_router
from app.api.routes.health import router as health_router
from app.core.config import settings
from app.core.logging_config import logger
from app.db.database import init_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup lifecycle
    logger.info(f"Starting {settings.PROJECT_NAME} (v{settings.VERSION})...")
    await init_db()
    yield
    # Shutdown lifecycle
    logger.info(f"Shutting down {settings.PROJECT_NAME}...")


app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="Vision-Language Assistant for Multimodal Remote Sensing Image Analysis (SIH 2026 / ISRO)",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API Routers
api_v1_prefix = "/api/v1"
app.include_router(health_router, prefix=api_v1_prefix)
app.include_router(assets_router, prefix=api_v1_prefix)
app.include_router(analysis_router, prefix=api_v1_prefix)

# Static files directory
static_dir = Path(__file__).parent / "static"
static_dir.mkdir(parents=True, exist_ok=True)


@app.get("/test", include_in_schema=False)
@app.get("/", include_in_schema=False)
async def serve_test_ui():
    """Serves the raw HTML/JS test page for dual GeoTIFF analysis."""
    index_file = static_dir / "index.html"
    if index_file.exists():
        return FileResponse(index_file)
    return JSONResponse({
        "project": settings.PROJECT_NAME,
        "message": "API is running. Visit /docs for OpenAPI documentation."
    })


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled exception on {request.url.path}: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={
            "status": "error",
            "error_type": type(exc).__name__,
            "detail": "An unexpected error occurred during image processing.",
            "path": request.url.path,
        }
    )
