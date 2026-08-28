import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, Enum, String

from app.core.database import Base
from app.schemas.sessions import SessionState


class Session(Base):
    __tablename__ = "sessions"

    session_id = Column(String, primary_key=True, default=lambda: uuid.uuid4().hex)
    user_id = Column(String, nullable=True, index=True)
    state = Column(Enum(SessionState), default=SessionState.active, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
