"""
Structured Logging Configuration for SatQuery AI.
"""

import logging
import sys
from typing import Optional


class TraceFormatter(logging.Formatter):
    """Custom formatter including trace/job ID if present."""

    def format(self, record: logging.LogRecord) -> str:
        if not hasattr(record, "job_id"):
            record.job_id = "SYSTEM"
        return super().format(record)


def setup_logger(name: str = "satquery", level: Optional[int] = None) -> logging.Logger:
    """Configures and returns the application logger."""
    logger = logging.getLogger(name)
    if logger.handlers:
        return logger

    log_level = level or logging.INFO
    logger.setLevel(log_level)

    handler = logging.StreamHandler(sys.stdout)
    handler.setLevel(log_level)

    formatter = TraceFormatter(
        fmt="%(asctime)s [%(levelname)s] [%(job_id)s] %(name)s: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S"
    )
    handler.setFormatter(formatter)
    logger.addHandler(handler)

    return logger


logger = setup_logger("satquery")
