"""Agent run endpoints: sync, stream, async jobs."""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import select

from agent_core import AgentInvokeInput

from ..db_models import AgentRunORM, ModelConfigORM
from ..deps import AgentRuntime, DbSession, RedisClient
from ..models import AgentRunRequest, AgentRunResponse, RunRecordResponse

router = APIRouter(prefix="/v1", tags=["agent"])


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _resolve_thread_id(payload: AgentRunRequest) -> str:
    return payload.threadId or payload.sessionId or str(uuid.uuid4())


async def _get_active_model_config(session: DbSession) -> dict | None:
    row = (await session.scalars(select(ModelConfigORM).where(ModelConfigORM.is_active == True).limit(1))).first()
    if row is None:
        return None
    return {"provider": row.provider, "model": row.model, "api_key": row.api_key, "base_url": row.base_url}


@router.post("/agents/runs", response_model=AgentRunResponse)
async def run_agent(
    payload: AgentRunRequest,
    runtime: AgentRuntime,
    redis: RedisClient,
    session: DbSession,
) -> AgentRunResponse:
    thread_id = _resolve_thread_id(payload)
    run_id = f"py-{int(datetime.now(timezone.utc).timestamp() * 1000)}"
    last_message = payload.messages[-1].content if payload.messages else (payload.message or "")
    if not last_message:
        raise HTTPException(status_code=400, detail="Request must include `messages` (non-empty) or `message`.")

    provider = payload.provider
    model = payload.model
    provider_configs = None

    if not provider and not model:
        active = await _get_active_model_config(session)
        if active:
            provider = active["provider"]
            model = active["model"]
            provider_configs = {active["provider"]: {"api_key": active["api_key"], "base_url": active["base_url"]}}

    if not provider:
        from ..config import settings
        provider = settings.AGENT_PROVIDER

    cache_key = f"agent:run:{provider}:{model or 'default'}:{thread_id}:{last_message}"

    try:
        cached = await redis.get(cache_key)
        if cached:
            return AgentRunResponse(
                runId=run_id, threadId=thread_id, output=cached,
                provider=str(provider), createdAt=_now_iso(), cached=True,
                checkpointId=None, toolCount=0,
            )
    except Exception:
        pass

    result = await runtime.invoke(
        AgentInvokeInput(
            prompt=last_message,
            provider=provider,
            model=model,
            thread_id=thread_id,
            metadata={"user_id": payload.userId, **(payload.metadata or {})},
            enabled_skills=payload.enabledSkills,
            run_id=run_id,
            provider_configs=provider_configs,
        )
    )

    # Persist run record
    try:
        session.add(AgentRunORM(
            run_id=run_id, thread_id=thread_id, prompt=last_message,
            output=result.output, provider=result.provider, model=model,
            checkpoint_id=result.checkpoint_id,
        ))
        await session.commit()
    except Exception:
        pass

    # Cache output
    try:
        await redis.set(cache_key, result.output, ex=120)
    except Exception:
        pass

    return AgentRunResponse(
        runId=run_id, threadId=thread_id, output=result.output,
        provider=result.provider, createdAt=_now_iso(), cached=False,
        checkpointId=result.checkpoint_id, toolCount=result.tool_count,
    )


@router.post("/agents/runs/stream")
async def run_agent_stream(
    payload: AgentRunRequest,
    runtime: AgentRuntime,
    session: DbSession,
) -> StreamingResponse:
    thread_id = _resolve_thread_id(payload)
    run_id = f"py-{int(datetime.now(timezone.utc).timestamp() * 1000)}"
    last_message = payload.messages[-1].content if payload.messages else (payload.message or "")
    if not last_message:
        raise HTTPException(status_code=400, detail="Request must include `messages` (non-empty) or `message`.")

    provider = payload.provider
    model = payload.model
    provider_configs = None

    if not provider and not model:
        active = await _get_active_model_config(session)
        if active:
            provider = active["provider"]
            model = active["model"]
            provider_configs = {active["provider"]: {"api_key": active["api_key"], "base_url": active["base_url"]}}

    if not provider:
        from ..config import settings
        provider = settings.AGENT_PROVIDER

    async def event_generator():
        yield f"data: {json.dumps({'type': 'run_start', 'runId': run_id, 'threadId': thread_id, 'at': _now_iso()})}\n\n"
        try:
            async for event in runtime.invoke_stream(
                AgentInvokeInput(
                    prompt=last_message, provider=provider, model=model,
                    thread_id=thread_id,
                    metadata={"user_id": payload.userId, **(payload.metadata or {})},
                    enabled_skills=payload.enabledSkills, run_id=run_id,
                    provider_configs=provider_configs,
                )
            ):
                yield f"data: {json.dumps({'type': event.type, **{k: v for k, v in event.__dict__.items() if k != 'type'}})}\n\n"
        except Exception as exc:
            yield f"data: {json.dumps({'type': 'error', 'message': str(exc), 'at': _now_iso()})}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@router.get("/runs/{run_id}", response_model=RunRecordResponse)
async def get_run(run_id: str, session: DbSession) -> RunRecordResponse:
    row = await session.get(AgentRunORM, run_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Run not found")
    return RunRecordResponse(
        runId=row.run_id, threadId=row.thread_id, prompt=row.prompt,
        output=row.output, provider=row.provider, model=row.model,
        checkpointId=row.checkpoint_id, createdAt=row.created_at.isoformat(),
    )
