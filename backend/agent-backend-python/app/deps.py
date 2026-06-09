"""FastAPI dependency injection helpers."""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import Depends, Header, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from .auth.service import decode_token


# ── Database session ──────────────────────────────────────────

def get_db_session_factory(request: Request) -> async_sessionmaker[AsyncSession]:
    factory = getattr(request.app.state, "db_session_factory", None)
    if factory is None:
        raise HTTPException(status_code=503, detail="Database is unavailable")
    return factory


async def get_db_session(
    factory: async_sessionmaker[AsyncSession] = Depends(get_db_session_factory),
):
    async with factory() as session:
        yield session


DbSession = Annotated[AsyncSession, Depends(get_db_session)]


# ── Redis ─────────────────────────────────────────────────────

def get_redis(request: Request):
    client = getattr(request.app.state, "redis_client", None)
    if client is None:
        raise HTTPException(status_code=503, detail="Redis is unavailable")
    return client


RedisClient = Annotated[Any, Depends(get_redis)]


# ── Runtime ───────────────────────────────────────────────────

def get_runtime(request: Request):
    rt = getattr(request.app.state, "runtime", None)
    if rt is None:
        raise HTTPException(status_code=503, detail="Agent runtime is not ready")
    return rt


AgentRuntime = Annotated[Any, Depends(get_runtime)]


# ── Skill Registry ────────────────────────────────────────────

def get_skill_registry(request: Request):
    reg = getattr(request.app.state, "skill_registry", None)
    if reg is None:
        raise HTTPException(status_code=503, detail="Skill registry is not ready")
    return reg


SkillRegistryDep = Annotated[Any, Depends(get_skill_registry)]


# ── Memory Store ──────────────────────────────────────────────

def get_memory_store(request: Request):
    store = getattr(request.app.state, "memory_store", None)
    if store is None:
        raise HTTPException(status_code=503, detail="Memory store is not ready")
    return store


MemoryStoreDep = Annotated[Any, Depends(get_memory_store)]


# ── Auth ──────────────────────────────────────────────────────

def get_current_user_optional(
    authorization: str | None = Header(default=None),
) -> dict[str, Any] | None:
    """Extract user from JWT if present, otherwise None."""
    if not authorization or not authorization.startswith("Bearer "):
        return None
    token = authorization.removeprefix("Bearer ").strip()
    try:
        return decode_token(token)
    except Exception:
        return None


def get_current_user(
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    """Require a valid JWT. Raises 401 if missing or invalid."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing authorization token")
    token = authorization.removeprefix("Bearer ").strip()
    try:
        return decode_token(token)
    except Exception as exc:
        raise HTTPException(status_code=401, detail="Invalid or expired token") from exc


CurrentUser = Annotated[dict[str, Any], Depends(get_current_user)]
OptionalUser = Annotated[dict[str, Any] | None, Depends(get_current_user_optional)]
