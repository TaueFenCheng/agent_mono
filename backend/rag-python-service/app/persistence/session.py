"""Async database engine and session helpers for the standalone RAG service."""

from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine

from ..config import Settings


def create_db_engine(settings: Settings) -> AsyncEngine:
    """Create the shared async SQLAlchemy engine used by repositories."""
    return create_async_engine(settings.postgres_async_dsn, pool_pre_ping=True)


def create_session_factory(engine: AsyncEngine) -> async_sessionmaker[AsyncSession]:
    """Create the shared async session factory used across repositories."""
    return async_sessionmaker(engine, expire_on_commit=False)


async def ensure_vector_extension(engine: AsyncEngine) -> None:
    """Ensure the Postgres `vector` extension exists before pgvector operations start."""
    async with engine.begin() as conn:
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))


async def ping_database(session_factory: async_sessionmaker[AsyncSession]) -> bool:
    """Perform a minimal `SELECT 1` health check through the shared async session factory."""
    async with session_factory() as session:
        await session.execute(text("SELECT 1"))
    return True
