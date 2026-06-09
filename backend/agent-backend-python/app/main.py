"""FastAPI application entry point — modular architecture aligned with TS backend."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from agent_core import (
    AgentCoreOptions,
    AgentCoreRuntime,
    InMemoryMemoryStore,
    SkillRegistry,
    make_checkpointer,
)
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from redis.asyncio import Redis
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine

from .config import settings
from .db_models import Base
from .exceptions import global_exception_handler
from .middleware import setup_middleware
from .orm_memory import SqlAlchemyMemoryStore

# ── Routers ───────────────────────────────────────────────────
from .auth.router import router as auth_router
from .routers.health import router as health_router
from .routers.agent import router as agent_router
from .routers.threads import router as threads_router
from .routers.memory import router as memory_router
from .routers.skills import router as skills_router
from .routers.mcp import router as mcp_router
from .routers.subagent import router as subagent_router
from .routers.model_configs import router as model_configs_router
from .routers.providers import router as providers_router
from .routers.attachments import router as attachments_router

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
logger = logging.getLogger("agent-backend")


async def _setup_database(engine: AsyncEngine) -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── Redis ─────────────────────────────────────────────────
    redis_client = Redis.from_url(settings.REDIS_URL, decode_responses=True)
    app.state.redis_client = redis_client

    # ── Postgres ───────────────────────────────────────────────
    db_engine: AsyncEngine | None = None
    db_session_factory: async_sessionmaker[AsyncSession] | None = None
    memory_store = None
    checkpointer_backend = "memory"

    try:
        db_engine = create_async_engine(settings.postgres_dsn, pool_pre_ping=True)
        async with db_engine.connect() as conn:
            await conn.execute(text("select 1"))
        await _setup_database(db_engine)
        db_session_factory = async_sessionmaker(db_engine, expire_on_commit=False)
        memory_store = SqlAlchemyMemoryStore(db_session_factory)
        await memory_store.setup()
        checkpointer_backend = settings.AGENT_CHECKPOINTER_BACKEND
        logger.info("Postgres connected, checkpointer=%s", checkpointer_backend)
    except Exception as exc:
        logger.warning("Postgres unavailable (%s), falling back to in-memory", exc)
        db_engine = None
        db_session_factory = None
        memory_store = InMemoryMemoryStore()
        await memory_store.setup()
        checkpointer_backend = "memory"

    app.state.db_engine = db_engine
    app.state.db_session_factory = db_session_factory
    app.state.memory_store = memory_store
    app.state.checkpointer_backend = checkpointer_backend

    # ── Skill Registry ────────────────────────────────────────
    skill_registry = SkillRegistry()
    app.state.skill_registry = skill_registry

    # ── Agent Runtime ─────────────────────────────────────────
    async with make_checkpointer(
        backend=checkpointer_backend,
        connection_string=settings.postgres_dsn if checkpointer_backend == "postgres" else None,
    ) as checkpointer:
        runtime = AgentCoreRuntime(
            checkpointer=checkpointer,
            memory_store=memory_store,
            skill_registry=skill_registry,
            options=AgentCoreOptions(
                default_provider=settings.AGENT_PROVIDER,
                default_model=None,
                system_prompt=settings.AGENT_SYSTEM_PROMPT,
            ),
        )
        app.state.runtime = runtime
        logger.info("Agent runtime ready")
        yield

    # ── Shutdown ───────────────────────────────────────────────
    if db_engine is not None:
        await db_engine.dispose()
    await redis_client.aclose()
    logger.info("Shutdown complete")


# ── App ───────────────────────────────────────────────────────

app = FastAPI(
    title="intelligent-agent-python",
    version="0.5.0",
    lifespan=lifespan,
)

# ── CORS ──────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Middleware ─────────────────────────────────────────────────
setup_middleware(app)

# ── Exception handler ─────────────────────────────────────────
app.add_exception_handler(Exception, global_exception_handler)

# ── Register routers ──────────────────────────────────────────
app.include_router(auth_router)
app.include_router(health_router)
app.include_router(agent_router)
app.include_router(threads_router)
app.include_router(memory_router)
app.include_router(skills_router)
app.include_router(mcp_router)
app.include_router(subagent_router)
app.include_router(model_configs_router)
app.include_router(providers_router)
app.include_router(attachments_router)
