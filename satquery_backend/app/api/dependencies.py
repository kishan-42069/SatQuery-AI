"""
FastAPI Dependencies for SatQuery AI.
"""

from typing import AsyncGenerator
from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.orchestrator import OrchestratorAgent
from app.ai.gemini_client import GeminiVisionClient
from app.db.database import get_db_session

# Singleton clients
_vision_client = GeminiVisionClient()
_orchestrator = OrchestratorAgent(vision_client=_vision_client)


def get_vision_client() -> GeminiVisionClient:
    return _vision_client


def get_orchestrator() -> OrchestratorAgent:
    return _orchestrator
