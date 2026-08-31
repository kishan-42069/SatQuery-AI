"""
Application Configuration for SatQuery AI.
Loads settings from environment variables and provides typed configuration.
"""

from pathlib import Path
from typing import List
from pydantic_settings import BaseSettings, SettingsConfigDict
from dotenv import load_dotenv

# Load .env file if available
load_dotenv()


class Settings(BaseSettings):
    # App Information
    PROJECT_NAME: str = "SatQuery AI"
    VERSION: str = "1.0.0"
    PROBLEM_STATEMENT: str = "SIH 2026 Problem Statement 26167 - ISRO"
    ENVIRONMENT: str = "development"
    DEBUG: bool = True

    # Server Bindings
    HOST: str = "0.0.0.0"
    PORT: int = 8000

    # Gemini API Configuration
    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-2.5-flash"

    # Storage & Upload Limits
    STORAGE_DIR: Path = Path("./storage")
    MAX_UPLOAD_SIZE: int = 100 * 1024 * 1024  # 100MB

    # Database Configuration (SQLite by default for zero-dependency local resilience)
    DATABASE_URL: str = "sqlite+aiosqlite:///./storage/satquery.db"

    # CORS Settings
    CORS_ORIGINS: List[str] = ["*"]

    # Geospatial Settings
    TARGET_CRS: str = "EPSG:4326"  # Standard WGS84 for GeoJSON and Map UI

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

    @property
    def uploads_dir(self) -> Path:
        p = self.STORAGE_DIR / "uploads"
        p.mkdir(parents=True, exist_ok=True)
        return p

    @property
    def previews_dir(self) -> Path:
        p = self.STORAGE_DIR / "previews"
        p.mkdir(parents=True, exist_ok=True)
        return p


settings = Settings()
