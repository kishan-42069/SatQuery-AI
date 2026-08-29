import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, Float, ForeignKey, String, Enum
from sqlalchemy.dialects.postgresql import JSONB

from app.core.database import Base
from app.schemas.workflows import WorkflowType

class AnalysisRun(Base):
    __tablename__ = "analysis_runs"

    run_id = Column(String, primary_key=True, default=lambda: uuid.uuid4().hex)
    query_id = Column(String, ForeignKey("queries.query_id"), nullable=False, index=True)
    workflow = Column(Enum(WorkflowType), nullable=True)
    plan = Column(String, nullable=True)
    tools_used = Column(JSONB, nullable=False, default=list)
    status = Column(String, nullable=False, default="started")
    trace = Column(JSONB, nullable=True)
    error = Column(String, nullable=True)
    duration_ms = Column(Float, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
