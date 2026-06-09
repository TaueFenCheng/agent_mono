"""Health check endpoint."""

from datetime import datetime, timezone

from fastapi import APIRouter, Request
from sqlalchemy import text

from ..deps import get_redis
from ..models import HealthResponse

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
async def health(request: Request) -> HealthResponse:
    postgres = "down"
    redis_status = "down"
    checkpointer = getattr(request.app.state, "checkpointer_backend", "memory")

    try:
        engine = getattr(request.app.state, "db_engine", None)
        if engine is not None:
            async with engine.connect() as conn:
                await conn.execute(text("select 1"))
            postgres = "up"
    except Exception:
        postgres = "down"

    try:
        redis_client = getattr(request.app.state, "redis_client", None)
        if redis_client is not None:
            pong = await redis_client.ping()
            redis_status = "up" if pong else "down"
    except Exception:
        redis_status = "down"

    return HealthResponse(
        status="ok",
        postgres=postgres,
        redis=redis_status,
        checkpointer=checkpointer,
        at=datetime.now(timezone.utc).isoformat(),
    )
