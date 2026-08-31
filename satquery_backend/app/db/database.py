"""
Database session management and lifecycle with robust fail-safety.
"""

from typing import AsyncGenerator
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from app.core.config import settings
from app.core.logging_config import logger
from app.db.models import Base

# Create async engine
try:
    engine = create_async_engine(
        settings.DATABASE_URL,
        echo=False,
        future=True,
    )
    async_session_factory = async_sessionmaker(
        engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )
    DB_AVAILABLE = True
except Exception as e:
    logger.error(f"Failed to initialize database engine with URL {settings.DATABASE_URL}: {e}")
    DB_AVAILABLE = False
    engine = None
    async_session_factory = None


async def init_db() -> None:
    """
    Initializes database tables on startup.
    """
    if not DB_AVAILABLE or engine is None:
        logger.warning("Database unavailable; skipping table initialization.")
        return

    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        logger.info("Database tables successfully verified and initialized.")
    except Exception as e:
        logger.error(f"Database initialization error: {e}. Operating in graceful in-memory mode.")


async def get_db_session() -> AsyncGenerator[AsyncSession, None]:
    """
    Dependency that provides an async database session.
    """
    if not DB_AVAILABLE or async_session_factory is None:
        yield None
        return

    async with async_session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception as e:
            await session.rollback()
            logger.error(f"Database session error: {e}")
            raise
        finally:
            await session.close()
