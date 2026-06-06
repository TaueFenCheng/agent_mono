import os
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from agent_core import (
    AgentCoreOptions,
    AgentCoreRuntime,
    AgentInvokeInput,
    InMemoryMemoryStore,
    SkillRegistry,
    make_checkpointer,
)
from fastapi import FastAPI, HTTPException
from redis.asyncio import Redis
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine

from .db_models import AgentRunORM, Base
from .models import (
    AgentRunRequest,
    AgentRunResponse,
    CreateMemoryFactRequest,
    HealthResponse,
    InvokeMcpToolRequest,
    InvokeMcpToolResponse,
    MemoryFactResponse,
    McpPluginInfo,
    McpPluginListResponse,
    McpToolInfo,
    McpToolListResponse,
    RunRecordResponse,
    SkillListResponse,
    SkillResponse,
    ThreadDetailResponse,
    ThreadListResponse,
    ThreadMemoryResponse,
)
from .orm_memory import SqlAlchemyMemoryStore

POSTGRES_DSN = (
    f"postgresql://{os.getenv('POSTGRES_USER', 'tang')}:{os.getenv('POSTGRES_PASSWORD', 'tang')}"
    f"@{os.getenv('POSTGRES_HOST', '127.0.0.1')}:{os.getenv('POSTGRES_PORT', '5432')}/{os.getenv('POSTGRES_DB', 'tang_agent')}"
)
REDIS_URL = os.getenv("REDIS_URL", "redis://127.0.0.1:6379")

db_engine: AsyncEngine | None = None
db_session_factory: async_sessionmaker[AsyncSession] | None = None
redis_client: Redis | None = None
memory_store: SqlAlchemyMemoryStore | InMemoryMemoryStore | None = None
skill_registry: SkillRegistry | None = None
runtime: AgentCoreRuntime | None = None
checkpointer_backend = "memory"


async def _setup_database(engine: AsyncEngine) -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _resolve_thread_id(payload: AgentRunRequest) -> str:
    return payload.threadId or payload.sessionId or str(uuid.uuid4())


def _require_runtime() -> AgentCoreRuntime:
    if runtime is None:
        raise HTTPException(status_code=503, detail="Agent runtime is not ready")
    return runtime


def _require_skill_registry() -> SkillRegistry:
    if skill_registry is None:
        raise HTTPException(status_code=503, detail="Skill registry is not ready")
    return skill_registry


def _require_memory_store() -> SqlAlchemyMemoryStore | InMemoryMemoryStore:
    if memory_store is None:
        raise HTTPException(status_code=503, detail="Memory store is not ready")
    return memory_store


@asynccontextmanager
async def lifespan(_: FastAPI):
    global db_engine, db_session_factory, redis_client, memory_store, skill_registry, runtime, checkpointer_backend

    redis_client = Redis.from_url(REDIS_URL, decode_responses=True)
    try:
        db_engine = create_async_engine(POSTGRES_DSN, pool_pre_ping=True)
        async with db_engine.connect() as conn:
            await conn.execute(text("select 1"))
        await _setup_database(db_engine)
        db_session_factory = async_sessionmaker(db_engine, expire_on_commit=False)
        memory_store = SqlAlchemyMemoryStore(db_session_factory)
        await memory_store.setup()
        checkpointer_backend = os.getenv("AGENT_CHECKPOINTER_BACKEND", "postgres")
    except Exception:
        db_engine = None
        db_session_factory = None
        memory_store = InMemoryMemoryStore()
        await memory_store.setup()
        checkpointer_backend = "memory"

    skill_registry = SkillRegistry()

    async with make_checkpointer(
        backend=checkpointer_backend,
        connection_string=POSTGRES_DSN if checkpointer_backend == "postgres" else None,
    ) as checkpointer:
        runtime = AgentCoreRuntime(
            checkpointer=checkpointer,
            memory_store=memory_store,
            skill_registry=skill_registry,
            options=AgentCoreOptions(
                default_provider=os.getenv("AGENT_PROVIDER", "qwen"),
                default_model=None,
                system_prompt=os.getenv(
                    "AGENT_SYSTEM_PROMPT",
                    "You are a pragmatic software engineering agent. Use tools when needed and keep answers concrete.",
                ),
            ),
        )
        yield

    if db_engine is not None:
        await db_engine.dispose()
    if redis_client is not None:
        await redis_client.aclose()


app = FastAPI(title="tang-agent-python", version="0.4.0", lifespan=lifespan)


@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    postgres = "down"
    redis = "down"

    try:
        if db_engine is not None:
            async with db_engine.connect() as conn:
                await conn.execute(text("select 1"))
                postgres = "up"
    except Exception:
        postgres = "down"

    try:
        if redis_client is not None:
            pong = await redis_client.ping()
            redis = "up" if pong else "down"
    except Exception:
        redis = "down"

    return HealthResponse(
        status="ok",
        postgres=postgres,
        redis=redis,
        checkpointer=checkpointer_backend,
        at=_now_iso(),
    )


@app.post("/v1/agents/runs", response_model=AgentRunResponse)
async def run_agent(payload: AgentRunRequest) -> AgentRunResponse:
    agent_runtime = _require_runtime()
    thread_id = _resolve_thread_id(payload)
    run_id = f"py-{int(datetime.now(timezone.utc).timestamp() * 1000)}"
    last_message = payload.messages[-1].content if payload.messages else ""
    provider = payload.provider or os.getenv("AGENT_PROVIDER", "qwen")
    model = payload.model
    cache_key = f"agent:run:{provider}:{model or 'default'}:{thread_id}:{last_message}"

    cached = await redis_client.get(cache_key) if redis_client is not None else None
    if cached:
        return AgentRunResponse(
            runId=run_id,
            threadId=thread_id,
            output=cached,
            provider=str(provider),
            createdAt=_now_iso(),
            cached=True,
            checkpointId=None,
            toolCount=0,
        )

    result = await agent_runtime.invoke(
        AgentInvokeInput(
            prompt=last_message,
            provider=provider,
            model=model,
            thread_id=thread_id,
            metadata={"user_id": payload.userId, **payload.metadata},
            enabled_skills=payload.enabledSkills,
            run_id=run_id,
        )
    )

    if db_session_factory is not None:
        try:
            async with db_session_factory() as session:
                exists = await session.get(AgentRunORM, run_id)
                if exists is None:
                    session.add(
                        AgentRunORM(
                            run_id=run_id,
                            thread_id=thread_id,
                            prompt=last_message,
                            output=result.output,
                            provider=result.provider,
                            model=model,
                            checkpoint_id=result.checkpoint_id,
                        )
                    )
                    await session.commit()
        except Exception:
            pass

    try:
        if redis_client is not None:
            await redis_client.set(cache_key, result.output, ex=120)
    except Exception:
        pass

    return AgentRunResponse(
        runId=run_id,
        threadId=thread_id,
        output=result.output,
        provider=result.provider,
        createdAt=_now_iso(),
        cached=False,
        checkpointId=result.checkpoint_id,
        toolCount=result.tool_count,
    )


@app.get("/v1/runs/{run_id}", response_model=RunRecordResponse)
async def get_run(run_id: str) -> RunRecordResponse:
    if db_session_factory is None:
        raise HTTPException(status_code=404, detail="Run storage is unavailable")

    async with db_session_factory() as session:
        row = await session.get(AgentRunORM, run_id)

    if row is None:
        raise HTTPException(status_code=404, detail="Run not found")

    return RunRecordResponse(
        runId=row.run_id,
        threadId=row.thread_id,
        prompt=row.prompt,
        output=row.output,
        provider=row.provider,
        model=row.model,
        checkpointId=row.checkpoint_id,
        createdAt=row.created_at.isoformat(),
    )


@app.get("/v1/threads", response_model=ThreadListResponse)
async def get_threads(limit: int = 20) -> ThreadListResponse:
    agent_runtime = _require_runtime()
    threads = await agent_runtime.list_threads(limit=limit)
    return ThreadListResponse(thread_list=threads)


@app.get("/v1/threads/{thread_id}", response_model=ThreadDetailResponse)
async def get_thread(thread_id: str) -> ThreadDetailResponse:
    agent_runtime = _require_runtime()
    thread = await agent_runtime.get_thread(thread_id)
    return ThreadDetailResponse(**thread)


@app.get("/v1/threads/{thread_id}/checkpoints", response_model=ThreadDetailResponse)
async def get_thread_checkpoints(thread_id: str) -> ThreadDetailResponse:
    agent_runtime = _require_runtime()
    thread = await agent_runtime.get_thread(thread_id)
    return ThreadDetailResponse(**thread)


@app.get("/v1/threads/{thread_id}/memory", response_model=ThreadMemoryResponse)
async def get_thread_memory(thread_id: str) -> ThreadMemoryResponse:
    store = _require_memory_store()
    facts = await store.list_facts(thread_id, limit=100)
    return ThreadMemoryResponse(thread_id=thread_id, facts=[MemoryFactResponse(**fact.__dict__) for fact in facts])


@app.post("/v1/threads/{thread_id}/memory/facts", response_model=MemoryFactResponse)
async def create_memory_fact(thread_id: str, payload: CreateMemoryFactRequest) -> MemoryFactResponse:
    store = _require_memory_store()
    fact = await store.create_fact(
        thread_id,
        content=payload.content,
        category=payload.category,
        confidence=payload.confidence,
        metadata=payload.metadata,
    )
    return MemoryFactResponse(**fact.__dict__)


@app.delete("/v1/threads/{thread_id}/memory/facts/{fact_id}")
async def delete_memory_fact(thread_id: str, fact_id: str) -> dict[str, bool]:
    store = _require_memory_store()
    return {"deleted": await store.delete_fact(thread_id, fact_id)}


@app.get("/v1/skills", response_model=SkillListResponse)
async def get_skills(enabled_only: bool = False) -> SkillListResponse:
    registry = _require_skill_registry()
    skills = registry.list_skills(enabled_only=enabled_only)
    return SkillListResponse(
        skills=[
            SkillResponse(
                name=skill.name,
                description=skill.description,
                path=str(skill.path),
                metadata=skill.metadata,
            )
            for skill in skills
        ]
    )


@app.get("/v1/skills/{skill_name}", response_model=SkillResponse)
async def get_skill(skill_name: str) -> SkillResponse:
    registry = _require_skill_registry()
    skill = registry.get_skill(skill_name)
    if skill is None:
        raise HTTPException(status_code=404, detail="Skill not found")
    return SkillResponse(
        name=skill.name,
        description=skill.description,
        path=str(skill.path),
        metadata=skill.metadata,
        content=skill.content,
    )


@app.get("/v1/mcp/plugins", response_model=McpPluginListResponse)
async def get_mcp_plugins() -> McpPluginListResponse:
    agent_runtime = _require_runtime()
    plugins = await agent_runtime.list_mcp_plugins()
    return McpPluginListResponse(plugins=[McpPluginInfo(**item) for item in plugins])


@app.get("/v1/mcp/tools", response_model=McpToolListResponse)
async def get_mcp_tools(threadId: str | None = None, runId: str | None = None) -> McpToolListResponse:
    agent_runtime = _require_runtime()
    tools = await agent_runtime.list_mcp_tools(thread_id=threadId, run_id=runId, metadata={})
    return McpToolListResponse(tools=[McpToolInfo(**item) for item in tools])


@app.post("/v1/mcp/tools/{tool_name}/invoke", response_model=InvokeMcpToolResponse)
async def invoke_mcp_tool(tool_name: str, payload: InvokeMcpToolRequest) -> InvokeMcpToolResponse:
    agent_runtime = _require_runtime()
    try:
        result = await agent_runtime.invoke_mcp_tool(
            tool_name,
            arguments=payload.arguments,
            thread_id=payload.threadId,
            run_id=payload.runId,
            metadata=payload.metadata,
        )
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    return InvokeMcpToolResponse(**result)
