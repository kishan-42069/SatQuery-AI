import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import JSONB

from app.core.database import Base


class Query(Base):
    __tablename__ = "queries"

    query_id = Column(String, primary_key=True, default=lambda: uuid.uuid4().hex)
    session_id = Column(String, ForeignKey("sessions.session_id"), nullable=False, index=True)
    text = Column(String, nullable=False)
    referenced_assets = Column(JSONB, nullable=False, default=list)  # list of asset_ids
    status = Column(String, nullable=False, default="queued")
    result = Column(JSONB, nullable=True)
    trace = Column(JSONB, nullable=True)
    error = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
