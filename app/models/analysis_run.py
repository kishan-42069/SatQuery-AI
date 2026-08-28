import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, Float, ForeignKey, String
from sqlalchemy.dialects.postgresql import JSONB

from app.core.database import Base


class AnalysisRun(Base):
    __tablename__ = "analysis_runs"

    run_id = Column(String, primary_key=True, default=lambda: uuid.uuid4().hex)
    query_id = Column(String, ForeignKey("queries.query_id"), nullable=False, index=True)
    plan = Column(String, nullable=True)
    tools_used = Column(JSONB, nullable=False, default=list)
    status = Column(String, nullable=False, default="started")
    duration_ms = Column(Float, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
