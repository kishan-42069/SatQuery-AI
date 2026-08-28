import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, String
from sqlalchemy.dialects.postgresql import JSONB

from app.core.database import Base


class ModelRun(Base):
    __tablename__ = "model_runs"

    model_run_id = Column(String, primary_key=True, default=lambda: uuid.uuid4().hex)
    model_id = Column(String, nullable=False, index=True)
    version = Column(String, nullable=False)
    input_refs = Column(JSONB, nullable=False, default=list)
    output_refs = Column(JSONB, nullable=False, default=list)
    metrics = Column(JSONB, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
