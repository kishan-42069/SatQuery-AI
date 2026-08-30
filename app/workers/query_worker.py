import asyncio
import json

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.agents.orchestrator import run_pipeline
from app.core.database import AsyncSessionLocal
from app.core.logger import get_logger
from app.core.redis_client import get_redis_client
from app.models.analysis_run import AnalysisRun
from app.models.finding import Finding
from app.models.query import Query
from app.models.report import Report
from app.models.session import Session
from app.models.image_asset import ImageAsset
from app.routers.workflows import store_workflow_result
from app.routers.reports import store_report

logger = get_logger("worker.query")


async def process_query(query_id: str, session_id: str) -> None:
    """Processes a single query through the LangGraph orchestrator."""
    logger.info("processing_query", query_id=query_id, session_id=session_id)
    
    redis = get_redis_client()
    
    async with AsyncSessionLocal() as db:
        # Retrieve Query
        result = await db.execute(select(Query).where(Query.query_id == query_id))
        query_record = result.scalars().first()
        
        if not query_record:
            logger.error("query_not_found", query_id=query_id)
            return
            
        query_record.status = "processing"
        await db.commit()
        
        # Publish trace update to WebSocket
        await redis.publish(f"satquery:traces:{session_id}", json.dumps({"step": "worker_started", "query_id": query_id}))
        
        # Retrieve asset paths
        asset_ids = query_record.referenced_assets
        asset_paths = {}
        for aid in asset_ids:
            asset_res = await db.execute(select(ImageAsset).where(ImageAsset.asset_id == aid))
            asset = asset_res.scalars().first()
            if asset:
                asset_paths[aid] = asset.uri
                
        # Retrieve Session to get conversation history
        session_res = await db.execute(select(Session).where(Session.session_id == session_id))
        session_record = session_res.scalars().first()
        chat_history = session_record.conversation_history if session_record else []
                
        # Run the orchestrator pipeline
        try:
            final_state = await run_pipeline(
                query_id=query_id,
                session_id=session_id,
                query_text=query_record.text,
                asset_ids=asset_ids,
                asset_paths=asset_paths,
                chat_history=chat_history
            )
            
            # Save results to DB
            run_id = await store_workflow_result(
                db=db,
                query_id=query_id,
                workflow=final_state.get("selected_workflow", "unknown"),
                findings=final_state.get("findings", []),
                trace=final_state.get("trace", []),
                duration_ms=None,
                error=final_state.get("error")
            )
            
            # Additional analysis run fields not handled by store_workflow_result
            run_res = await db.execute(select(AnalysisRun).where(AnalysisRun.run_id == run_id))
            db_run = run_res.scalars().first()
            if db_run:
                db_run.plan = final_state.get("plan")
            
            report_data = final_state.get("report")
            if report_data:
                await store_report(
                    db=db,
                    run_id=run_id,
                    session_id=session_id,
                    summary=report_data["summary"],
                    evidence=report_data["evidence"]
                )
                    
            query_record.status = "failed" if final_state.get("error") else "completed"
            query_record.trace = final_state.get("trace")
            query_record.result = {"run_id": run_id}
            
            # Update session conversational history
            if session_record:
                hist = list(session_record.conversation_history)
                hist.append({"role": "user", "content": query_record.text})
                agent_reply = final_state.get("plan") or "Workflow executed."
                hist.append({"role": "assistant", "content": agent_reply})
                session_record.conversation_history = hist
            
            await db.commit()
            
            await redis.publish(f"satquery:traces:{session_id}", json.dumps({"step": "worker_completed", "query_id": query_id, "run_id": run_id}))
            logger.info("query_completed", query_id=query_id)
            
        except Exception as exc:
            logger.exception("pipeline_crashed", query_id=query_id)
            query_record.status = "failed"
            query_record.error = str(exc)
            await db.commit()
            await redis.publish(f"satquery:traces:{session_id}", json.dumps({"step": "worker_failed", "query_id": query_id, "error": str(exc)}))


async def worker_loop() -> None:
    """Continuously polls the Redis queue for new queries."""
    redis = get_redis_client()
    logger.info("query_worker_started")
    while True:
        try:
            # brpop blocks until an item is available
            result = await redis.brpop("satquery:query_queue", timeout=5)
            if result:
                _, message = result
                data = json.loads(message)
                # Process in a fire-and-forget task so worker can keep polling
                asyncio.create_task(process_query(data["query_id"], data["session_id"]))
        except asyncio.CancelledError:
            break
        except Exception as exc:
            logger.error("worker_loop_error", error=str(exc))
            await asyncio.sleep(1)


if __name__ == "__main__":
    from app.core.logger import setup_logging
    setup_logging()
    asyncio.run(worker_loop())
