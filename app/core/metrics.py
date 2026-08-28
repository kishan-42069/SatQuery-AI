import time
from contextlib import contextmanager
from typing import Generator

from app.core.logger import get_logger

logger = get_logger("metrics")


@contextmanager
def track_performance(operation_name: str) -> Generator[None, None, None]:
    """
    Context manager to track latency and memory use for an operation.
    Logs the metrics so they can be aggregated later for p50/p95 tracking.
    """
    start_time = time.monotonic()
    
    # Try to import psutil for memory tracking, fallback if missing
    start_mem = None
    try:
        import psutil
        import os
        process = psutil.Process(os.getpid())
        start_mem = process.memory_info().rss
    except ImportError:
        pass

    try:
        yield
    finally:
        end_time = time.monotonic()
        duration_ms = (end_time - start_time) * 1000
        
        mem_diff_mb = None
        if start_mem is not None:
            end_mem = process.memory_info().rss
            mem_diff_mb = (end_mem - start_mem) / (1024 * 1024)
            
        logger.info(
            "performance_metric",
            operation=operation_name,
            duration_ms=round(duration_ms, 2),
            memory_diff_mb=round(mem_diff_mb, 2) if mem_diff_mb is not None else "unknown"
        )
