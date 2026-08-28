# Session & Query Router: session lifecycle, NL query submission, WebSocket streaming (FR-003, FR-004, FR-012).
from __future__ import annotations

import asyncio
import json
import uuid
from datetime import datetime

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect, status

from app.core.logger import get_logger
from app.core.redis_client import get_redis_client
from app.middleware.security import sanitize_query
from app.schemas.sessions import (
    QueryRequest,
    QueryStatusResponse,
    QuerySubmitResponse,
    SessionCreateResponse,
    SessionInfoResponse,
    SessionState,
)

router = APIRouter(prefix="/sessions", tags=["Sessions & Queries"])
logger = get_logger("router.sessions")

# In-memory session and query stores for MVP — replace with DB + Redis persistence.
_session_store: dict[str, dict] = {}
_query_store: dict[str, dict] = {}


@router.post(
    "/",
    response_model=SessionCreateResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new analysis session (FR-012)",
)
async def create_session():
    session_id = uuid.uuid4().hex
    record = {
        "session_id": session_id,
        "state": SessionState.active,
        "created_at": datetime.utcnow(),
        "query_count": 0,
        "referenced_asset_ids": [],
        "conversation_history": [],  # Session-level conversational memory
    }
    _session_store[session_id] = record
    logger.info("session_created", session_id=session_id)
    return SessionCreateResponse(**record)


@router.get(
    "/{session_id}",
    response_model=SessionInfoResponse,
    summary="Get session info",
)
async def get_session(session_id: str):
    _require_session(session_id)
    return SessionInfoResponse(**_session_store[session_id])


@router.delete(
    "/{session_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Close and delete a session",
)
async def close_session(session_id: str):
    _require_session(session_id)
    _session_store.pop(session_id)
    logger.info("session_closed", session_id=session_id)


@router.post(
    "/{session_id}/queries",
    response_model=QuerySubmitResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Submit a natural-language query (FR-003, FR-004)",
)
async def submit_query(session_id: str, body: QueryRequest):
    _require_session(session_id)

    # Sanitize NL input against prompt injection before passing to orchestrator
    safe_text = sanitize_query(body.text)

    query_id = uuid.uuid4().hex
    query_record = {
        "query_id": query_id,
        "session_id": session_id,
        "text": safe_text,
        "asset_ids": body.asset_ids,
        "status": "queued",
        "result": None,
        "trace": None,
        "error": None,
        "created_at": datetime.utcnow(),
    }
    _query_store[query_id] = query_record
    _session_store[session_id]["query_count"] += 1
    _session_store[session_id]["referenced_asset_ids"].extend(body.asset_ids)

    # Queue the query for async orchestrator execution
    redis = get_redis_client()
    await redis.lpush("satquery:query_queue", json.dumps({"query_id": query_id, "session_id": session_id}))
    logger.info("query_queued", query_id=query_id, session_id=session_id)

    return QuerySubmitResponse(query_id=query_id, session_id=session_id)


@router.get(
    "/{session_id}/queries/{query_id}/status",
    response_model=QueryStatusResponse,
    summary="Poll query status (FR-004)",
)
async def get_query_status(session_id: str, query_id: str):
    _require_session(session_id)
    _require_query(query_id, session_id)
    return QueryStatusResponse(**_query_store[query_id])


# ── WEBSOCKET: Real-time agent trace streaming ─────────────────────────────────
# Foundation for streaming agent step traces to the frontend in real time.
# The orchestrator will push trace events to Redis pub/sub; this WS subscribes.
@router.websocket("/{session_id}/ws")
async def session_websocket(websocket: WebSocket, session_id: str):
    """WebSocket endpoint: streams agent execution traces for the session."""
    await websocket.accept()
    logger.info("ws_connected", session_id=session_id)
    redis = get_redis_client()
    pubsub = redis.pubsub()
    await pubsub.subscribe(f"satquery:traces:{session_id}")
    try:
        async for message in pubsub.listen():
            if message["type"] == "message":
                await websocket.send_text(message["data"])
    except WebSocketDisconnect:
        logger.info("ws_disconnected", session_id=session_id)
    finally:
        await pubsub.unsubscribe(f"satquery:traces:{session_id}")


# ── Helpers ────────────────────────────────────────────────────────────────────
def _require_session(session_id: str) -> None:
    if session_id not in _session_store:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Session '{session_id}' not found.")

def _require_query(query_id: str, session_id: str) -> None:
    q = _query_store.get(query_id)
    if not q or q["session_id"] != session_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Query '{query_id}' not found in session '{session_id}'.")
