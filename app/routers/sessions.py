import asyncio
import json
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

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
from app.core.database import get_db
from app.models.session import Session
from app.models.query import Query

router = APIRouter(prefix="/sessions", tags=["Sessions & Queries"])
logger = get_logger("router.sessions")


@router.post(
    "/",
    response_model=SessionCreateResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new analysis session (FR-012)",
)
async def create_session(db: AsyncSession = Depends(get_db)):
    session_id = uuid.uuid4().hex
    
    new_session = Session(
        session_id=session_id,
        state=SessionState.active,
        conversation_history=[]
    )
    db.add(new_session)
    await db.commit()
    await db.refresh(new_session)
    
    logger.info("session_created", session_id=session_id)
    return SessionCreateResponse(
        session_id=new_session.session_id,
        state=new_session.state,
        created_at=new_session.created_at,
        query_count=0,
        referenced_asset_ids=[],
        conversation_history=[]
    )


@router.get(
    "/{session_id}",
    response_model=SessionInfoResponse,
    summary="Get session info",
)
async def get_session(session_id: str, db: AsyncSession = Depends(get_db)):
    session = await _require_session(session_id, db)
    
    # Get query count
    count_result = await db.execute(select(func.count(Query.query_id)).where(Query.session_id == session_id))
    query_count = count_result.scalar_one_or_none() or 0
    
    # Get referenced assets
    queries_result = await db.execute(select(Query.referenced_assets).where(Query.session_id == session_id))
    referenced_assets = set()
    for q in queries_result.scalars():
        if q:
            referenced_assets.update(q)
            
    return SessionInfoResponse(
        session_id=session.session_id,
        state=session.state,
        created_at=session.created_at,
        query_count=query_count,
        referenced_asset_ids=list(referenced_assets),
        conversation_history=session.conversation_history
    )


@router.delete(
    "/{session_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Close and delete a session",
)
async def close_session(session_id: str, db: AsyncSession = Depends(get_db)):
    session = await _require_session(session_id, db)
    
    # Cascade delete might not be set up, so delete queries first
    await db.execute(Query.__table__.delete().where(Query.session_id == session_id))
    await db.delete(session)
    await db.commit()
    
    logger.info("session_closed", session_id=session_id)


@router.post(
    "/{session_id}/queries",
    response_model=QuerySubmitResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Submit a natural-language query (FR-003, FR-004)",
)
async def submit_query(session_id: str, body: QueryRequest, db: AsyncSession = Depends(get_db)):
    session = await _require_session(session_id, db)

    # Sanitize NL input against prompt injection before passing to orchestrator
    safe_text = sanitize_query(body.text)

    query_id = uuid.uuid4().hex
    
    new_query = Query(
        query_id=query_id,
        session_id=session_id,
        text=safe_text,
        referenced_assets=body.asset_ids,
        status="queued"
    )
    db.add(new_query)
    await db.commit()

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
async def get_query_status(session_id: str, query_id: str, db: AsyncSession = Depends(get_db)):
    await _require_session(session_id, db)
    query = await _require_query(query_id, session_id, db)
    
    return QueryStatusResponse(
        query_id=query.query_id,
        session_id=query.session_id,
        text=query.text,
        asset_ids=query.referenced_assets,
        status=query.status,
        result=query.result,
        trace=query.trace,
        error=query.error,
        created_at=query.created_at
    )


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
async def _require_session(session_id: str, db: AsyncSession) -> Session:
    result = await db.execute(select(Session).where(Session.session_id == session_id))
    session = result.scalars().first()
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Session '{session_id}' not found.")
    return session

async def _require_query(query_id: str, session_id: str, db: AsyncSession) -> Query:
    result = await db.execute(select(Query).where(Query.query_id == query_id))
    q = result.scalars().first()
    if not q or q.session_id != session_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Query '{query_id}' not found in session '{session_id}'.")
    return q
