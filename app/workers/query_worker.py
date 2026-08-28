import asyncio
import json

from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.orchestrator import run_pipeline
from app.core.database import AsyncSessionLocal
from app.core.logger import get_logger
from app.core.redis_client import get_redis_client
from app.models.analysis_run import AnalysisRun
from app.models.finding import Finding
from app.models.query import Query
from app.models.report import Report
from app.routers.sessions import _query_store, _session_store
from app.routers.workflows import store_workflow_result

logger = get_logger("worker.query")


async def process_query(query_id: str, session_id: str) -> None:
    """Processes a single query through the LangGraph orchestrator."""
    logger.info("processing_query", query_id=query_id, session_id=session_id)
    
    # ── For MVP, we fall back to in-memory store if DB is empty, 
    # but let's wire up DB persistence where possible.
    query_record = _query_store.get(query_id)
    if not query_record:
        logger.error("query_not_found", query_id=query_id)
        return
        
    query_record["status"] = "processing"
    
    # Publish trace update to WebSocket
    redis = get_redis_client()
    await redis.publish(f"satquery:traces:{session_id}", json.dumps({"step": "worker_started", "query_id": query_id}))
    
    # Retrieve asset paths
    # In a real app, query DB. Here we just mock it.
    asset_ids = query_record.get("asset_ids", [])
    asset_paths = {}
    from app.routers.assets import _asset_store
    for aid in asset_ids:
        if aid in _asset_store:
            asset_paths[aid] = _asset_store[aid]["storage_path"]
            
    # Run the orchestrator pipeline
    try:
        final_state = await run_pipeline(
            query_id=query_id,
            session_id=session_id,
            query_text=query_record["text"],
            asset_ids=asset_ids,
            asset_paths=asset_paths
        )
        
        # Save results to DB
        async with AsyncSessionLocal() as db_session:
            # Create analysis run
            run_id = store_workflow_result(
                query_id=query_id,
                workflow=final_state.get("selected_workflow", "unknown"),
                findings=final_state.get("findings", []),
                trace=final_state.get("trace", []),
                error=final_state.get("error")
            )
            
            db_run = AnalysisRun(
                run_id=run_id,
                query_id=query_id,
                plan=final_state.get("plan"),
                tools_used=[],
                status="failed" if final_state.get("error") else "completed"
            )
            db_session.add(db_run)
            
            for finding in final_state.get("findings", []):
                db_finding = Finding(
                    finding_id=finding["finding_id"],
                    run_id=run_id,
                    label=finding.get("label"),
                    confidence=finding.get("confidence", 0.0),
                    evidence_refs=finding.get("evidence_refs", [])
                )
                db_session.add(db_finding)
                
            report_data = final_state.get("report")
            if report_data:
                db_report = Report(
                    report_id=report_data["report_id"],
                    run_id=run_id,
                    session_id=session_id,
                    summary=report_data["summary"],
                    evidence=report_data["evidence"]
                )
                db_session.add(db_report)
                from app.routers.reports import store_report
                store_report(
                    run_id=run_id,
                    session_id=session_id,
                    summary=report_data["summary"],
                    evidence=report_data["evidence"]
                )
                
            await db_session.commit()
        
        query_record["status"] = "completed"
        query_record["trace"] = final_state.get("trace")
        query_record["result"] = {"run_id": run_id}
        
        await redis.publish(f"satquery:traces:{session_id}", json.dumps({"step": "worker_completed", "query_id": query_id, "run_id": run_id}))
        logger.info("query_completed", query_id=query_id)
        
    except Exception as exc:
        logger.exception("pipeline_crashed", query_id=query_id)
        query_record["status"] = "failed"
        query_record["error"] = str(exc)
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
