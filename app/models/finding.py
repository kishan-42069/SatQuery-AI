import uuid
from datetime import datetime

from geoalchemy2 import Geometry
from sqlalchemy import Column, DateTime, Float, ForeignKey, String
from sqlalchemy.dialects.postgresql import JSONB

from app.core.database import Base


class Finding(Base):
    __tablename__ = "findings"

    finding_id = Column(String, primary_key=True, default=lambda: uuid.uuid4().hex)
    run_id = Column(String, ForeignKey("analysis_runs.run_id"), nullable=False, index=True)
    geometry = Column(Geometry(geometry_type="GEOMETRY", srid=4326), nullable=True)
    label = Column(String, nullable=True)
    confidence = Column(Float, nullable=False)
    evidence_refs = Column(JSONB, nullable=False, default=list)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
