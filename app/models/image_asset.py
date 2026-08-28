import uuid
from datetime import datetime

from geoalchemy2 import Geometry
from sqlalchemy import Column, DateTime, Enum, String

from app.core.database import Base
from app.schemas.assets import ImageModality


class ImageAsset(Base):
    __tablename__ = "image_assets"

    asset_id = Column(String, primary_key=True, default=lambda: uuid.uuid4().hex)
    uri = Column(String, nullable=False)
    modality = Column(Enum(ImageModality), nullable=False)
    crs = Column(String, nullable=True)
    bbox = Column(Geometry(geometry_type="POLYGON", srid=4326), nullable=True)
    acquisition_time = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
