# Pydantic schemas for session management and natural language queries.
from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, Field


class SessionState(str, Enum):
    active = "active"
    idle = "idle"
    closed = "closed"


class SessionCreateResponse(BaseModel):
    session_id: str
    user_id: Optional[str] = None
    state: SessionState = SessionState.active
    created_at: datetime
    message: str = "Session created."


class SessionInfoResponse(BaseModel):
    session_id: str
    state: SessionState
    created_at: datetime
    query_count: int
    referenced_asset_ids: list[str]


class QueryRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=4096, description="Natural language query")
    asset_ids: list[str] = Field(default_factory=list, description="Asset IDs to include in this query")
    session_id: str

class QuerySubmitResponse(BaseModel):
    query_id: str
    session_id: str
    status: str = "queued"
    message: str = "Query submitted. Use /sessions/{session_id}/queries/{query_id}/status to poll, or connect via WebSocket."


class QueryStatusResponse(BaseModel):
    query_id: str
    session_id: str
    status: str
    result: Optional[Any] = None
    trace: Optional[list[dict]] = None
    error: Optional[str] = None
