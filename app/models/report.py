import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import JSONB

from app.core.database import Base


class Report(Base):
    __tablename__ = "reports"

    report_id = Column(String, primary_key=True, default=lambda: uuid.uuid4().hex)
    run_id = Column(String, ForeignKey("analysis_runs.run_id"), nullable=False, index=True)
    session_id = Column(String, ForeignKey("sessions.session_id"), nullable=False, index=True)
    summary = Column(String, nullable=False)
    evidence = Column(JSONB, nullable=False, default=list)
    export_uri = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
