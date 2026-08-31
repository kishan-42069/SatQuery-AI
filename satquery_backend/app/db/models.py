"""
SQLAlchemy ORM Data Models for SatQuery AI.
"""

import datetime
from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import declarative_base, relationship

Base = declarative_base()


class SessionModel(Base):
    """Represents an analyst interactive session."""
    __tablename__ = "sessions"

    session_id = Column(String(64), primary_key=True, index=True)
    user_id = Column(String(64), default="default_analyst", index=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    # Relationships
    assets = relationship("ImageAssetModel", back_populates="session", cascade="all, delete-orphan")
    jobs = relationship("AnalysisJobModel", back_populates="session", cascade="all, delete-orphan")


class ImageAssetModel(Base):
    """Represents an uploaded GeoTIFF raster asset."""
    __tablename__ = "image_assets"

    asset_id = Column(String(64), primary_key=True, index=True)
    session_id = Column(String(64), ForeignKey("sessions.session_id"), nullable=True)
    filename = Column(String(255), nullable=False)
    file_path = Column(String(512), nullable=False)
    preview_path = Column(String(512), nullable=False)
    width = Column(Integer, nullable=False)
    height = Column(Integer, nullable=False)
    band_count = Column(Integer, nullable=False)
    crs_epsg = Column(Integer, nullable=True)
    crs_wkt = Column(Text, nullable=True)
    bounds_json = Column(Text, nullable=True)
    wgs84_bounds_json = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    # Relationships
    session = relationship("SessionModel", back_populates="assets")


class AnalysisJobModel(Base):
    """Represents an executed multi-agent analysis run."""
    __tablename__ = "analysis_jobs"

    job_id = Column(String(64), primary_key=True, index=True)
    session_id = Column(String(64), ForeignKey("sessions.session_id"), nullable=True)
    query = Column(Text, nullable=False)
    workflow = Column(String(64), nullable=False)
    status = Column(String(32), default="completed", index=True)
    image_1_id = Column(String(64), ForeignKey("image_assets.asset_id"), nullable=False)
    image_2_id = Column(String(64), ForeignKey("image_assets.asset_id"), nullable=True)
    result_json = Column(Text, nullable=True)
    error_message = Column(Text, nullable=True)
    duration_ms = Column(Float, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    completed_at = Column(DateTime, default=datetime.datetime.utcnow)

    # Relationships
    session = relationship("SessionModel", back_populates="jobs")
    findings = relationship("FindingModel", back_populates="job", cascade="all, delete-orphan")
    report = relationship("ReportModel", uselist=False, back_populates="job", cascade="all, delete-orphan")


class FindingModel(Base):
    """Represents a localized finding or change detection polygon."""
    __tablename__ = "findings"

    finding_id = Column(String(64), primary_key=True, index=True)
    job_id = Column(String(64), ForeignKey("analysis_jobs.job_id"), nullable=False)
    label = Column(String(128), nullable=False)
    confidence = Column(Float, nullable=False)
    description = Column(Text, nullable=True)
    geojson = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    # Relationships
    job = relationship("AnalysisJobModel", back_populates="findings")


class ReportModel(Base):
    """Represents synthesized Earth Observation report."""
    __tablename__ = "reports"

    report_id = Column(String(64), primary_key=True, index=True)
    job_id = Column(String(64), ForeignKey("analysis_jobs.job_id"), nullable=False, unique=True)
    executive_summary = Column(Text, nullable=False)
    key_findings_json = Column(Text, nullable=True)
    spatial_impact = Column(Text, nullable=True)
    confidence_assessment = Column(Text, nullable=True)
    recommendations_json = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    # Relationships
    job = relationship("AnalysisJobModel", back_populates="report")
