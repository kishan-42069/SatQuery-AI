import uuid
from datetime import datetime
from sqlalchemy import Column, DateTime, String
from app.core.database import Base

class User(Base):
    __tablename__ = "users"

    user_id = Column(String, primary_key=True, default=lambda: uuid.uuid4().hex)
    username = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
