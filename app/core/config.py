# Reads all settings from .env — the single source of truth for configuration.
from functools import lru_cache
from typing import Literal

from pydantic import AnyUrl, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # App
    app_env: Literal["development", "production"] = "development"
    log_level: str = "INFO"

    # Database
    database_url: str = "postgresql+asyncpg://satquery:password@localhost:5432/satquery_db"

    # Redis
    redis_url: str = "redis://localhost:6379/0"

    # Security
    secret_key: str = "change-me-in-production"
    allowed_origins: list[str] | str = ["http://localhost:3000"]

    @field_validator("allowed_origins", mode="after")
    @classmethod
    def parse_origins(cls, v: str | list) -> list[str]:
        if isinstance(v, str):
            return [o.strip() for o in v.split(",")]
        return v

    # Storage
    # ⚠️  IMPORTANT: For MVP this is local filesystem.
    # Set STORAGE_BACKEND=s3 and fill S3 vars in .env for production.
    storage_backend: Literal["local", "s3"] = "local"
    storage_local_root: str = "./data"

    # Upload limits
    max_upload_size_mb: int = 500
    allowed_image_formats: list[str] | str = ["tif", "tiff", "jp2", "img", "hdf5", "nc", "png", "jpg", "jpeg"]

    @field_validator("allowed_image_formats", mode="after")
    @classmethod
    def parse_formats(cls, v: str | list) -> list[str]:
        if isinstance(v, str):
            return [f.strip().lower() for f in v.split(",")]
        return v

    # ── MODEL INJECTION POINT ──────────────────────────────────────────────────
    # Set VLM_MODEL_NAME in .env once you decide which model to use.
    # The model loader in app/core/model_provider.py reads this value.
    # ──────────────────────────────────────────────────────────────────────────
    vlm_model_name: str = "PLACEHOLDER_SET_WHEN_MODEL_IS_CHOSEN"
    vlm_device: str = "cpu"

    # ── LLM / ORCHESTRATOR INJECTION POINT ────────────────────────────────────
    # GPT-4o is selected as the default (best production results for agentic tasks).
    # Provide OPENAI_API_KEY in .env when you have it.
    # ──────────────────────────────────────────────────────────────────────────
    llm_provider: Literal["openai", "gemini", "ollama"] = "openai"
    llm_model: str = "gpt-4o"
    openai_api_key: str = "PLACEHOLDER_API_KEY_TO_BE_PROVIDED"
    google_api_key: str = ""
    ollama_base_url: str = "http://localhost:11434"

    # ── GEMINI VLM (Specialist Agents) ────────────────────────────────────────
    # Used by GeminiVisionClient in app/ai/gemini_client.py for image analysis.
    # If not set, the client operates in offline/heuristic mode automatically.
    # ──────────────────────────────────────────────────────────────────────────
    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.5-flash"


@lru_cache
def get_settings() -> Settings:
    return Settings()
