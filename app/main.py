# SatQuery AI — FastAPI application entry point.
from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings
from app.core.database import init_db, check_db_connection
from app.core.logger import get_logger, setup_logging
from app.core.redis_client import close_redis_pool, get_redis_client, check_redis_connection
from app.middleware.security import SecurityMiddleware
from app.routers import assets, auth, reports, sessions, workflows

settings = get_settings()
setup_logging()
logger = get_logger("app")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown lifecycle."""
    logger.info("satquery_starting", env=settings.app_env)

    # Verify Redis connectivity
    redis = get_redis_client()
    await redis.ping()
    logger.info("redis_connected", url=settings.redis_url)

    # Initialize DB tables (dev only; use Alembic in production)
    if settings.app_env == "development":
        await init_db()
        logger.info("db_tables_initialized")

    yield

    # Shutdown: close connection pools
    await close_redis_pool()
    logger.info("satquery_shutdown")


app = FastAPI(
    title="SatQuery AI",
    description="Agentic AI-powered vision-language assistant for remote-sensing imagery.",
    version="0.1.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# ── CORS ───────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Security middleware ────────────────────────────────────────────────────────
app.add_middleware(SecurityMiddleware)

# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(auth.router, prefix="/api/v1")
app.include_router(assets.router, prefix="/api/v1")
app.include_router(sessions.router, prefix="/api/v1")
app.include_router(workflows.router, prefix="/api/v1")
app.include_router(reports.router, prefix="/api/v1")


@app.get("/health", tags=["Health"])
async def health_check():
    """Health probe for Docker/load balancer."""
    db_ok = await check_db_connection()
    redis_ok = await check_redis_connection()
    if not (db_ok and redis_ok):
        raise HTTPException(status_code=503, detail={"status": "error", "db": db_ok, "redis": redis_ok})
    return {"status": "ok", "version": "0.1.0", "env": settings.app_env, "db": db_ok, "redis": redis_ok}
