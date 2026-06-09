"""Subagent endpoints: sync, stream, job polling."""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import select

from ..db_models import ModelConfigORM, SubagentRunORM, SubagentTaskRunORM
from ..deps import AgentRuntime, DbSession, RedisClient
from ..models import SubagentRunRecordResponse, SubagentRunRequest, SubagentRunResponse, SubagentTaskResult

router = APIRouter(prefix="/v1", tags=["subagent"])


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def _get_active_model_config(session: DbSession) -> dict | None:
    row = (await session.scalars(select(ModelConfigORM).where(ModelConfigORM.is_active == True).limit(1))).first()
    if row is None:
        return None
    return {"provider": row.provider, "model": row.model, "api_key": row.api_key, "base_url": row.base_url}


@router.post("/agents/subruns", response_model=SubagentRunResponse)
async def run_subagents(
    payload: SubagentRunRequest,
    runtime: AgentRuntime,
    redis: RedisClient,
    session: DbSession,
) -> SubagentRunResponse:
    if not payload.tasks and not payload.prompt:
        raise HTTPException(status_code=400, detail="Subagent run requires non-empty `tasks` or `prompt`.")
    if payload.tasks and len(payload.tasks) > 8:
        raise HTTPException(status_code=400, detail="Subagent run supports at most 8 tasks per run.")

    thread_id = payload.threadId or payload.sessionId or f"thread-{int(datetime.now(timezone.utc).timestamp() * 1000)}"
    run_id = f"subrun-{int(datetime.now(timezone.utc).timestamp() * 1000)}"

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

    tasks_input = [
        {"role": t.role, "prompt": t.prompt, "task_id": t.taskId, "provider": t.provider, "model": t.model}
        for t in (payload.tasks or [])
    ]

    result = await runtime.invoke_subagents(
        thread_id=thread_id, run_id=run_id, prompt=payload.prompt,
        tasks=tasks_input, provider=provider, model=model,
        metadata={"user_id": payload.userId, **(payload.metadata or {})},
        enabled_skills=payload.enabledSkills,
        max_concurrency=payload.maxConcurrency,
        task_timeout_ms=payload.taskTimeoutMs,
        provider_configs=provider_configs,
    )

    # Persist
    try:
        run_orm = SubagentRunORM(
            run_id=result.run_id, thread_id=result.thread_id,
            prompt=payload.prompt, summary=result.summary, partial=result.partial,
        )
        session.add(run_orm)
        for tr in result.results:
            session.add(SubagentTaskRunORM(
                run_id=result.run_id, task_id=tr.task_id, role=tr.role, status=tr.status,
                thread_id=tr.thread_id, provider=tr.provider, model=tr.model,
                output=tr.output, error=tr.error, checkpoint_id=tr.checkpoint_id,
                started_at=datetime.fromisoformat(tr.started_at),
                ended_at=datetime.fromisoformat(tr.ended_at),
                duration_ms=tr.duration_ms,
            ))
        await session.commit()
    except Exception:
        pass

    return SubagentRunResponse(
        runId=result.run_id, threadId=result.thread_id, summary=result.summary,
        partial=result.partial, createdAt=_now_iso(),
        results=[
            SubagentTaskResult(
                taskId=r.task_id, role=r.role, status=r.status, threadId=r.thread_id,
                provider=r.provider, model=r.model, output=r.output, error=r.error,
                checkpointId=r.checkpoint_id, startedAt=r.started_at, endedAt=r.ended_at,
                durationMs=r.duration_ms,
            )
            for r in result.results
        ],
    )


@router.post("/agents/subruns/stream")
async def run_subagents_stream(
    payload: SubagentRunRequest,
    runtime: AgentRuntime,
    session: DbSession,
) -> StreamingResponse:
    if not payload.tasks and not payload.prompt:
        raise HTTPException(status_code=400, detail="Subagent run requires non-empty `tasks` or `prompt`.")

    thread_id = payload.threadId or payload.sessionId or f"thread-{int(datetime.now(timezone.utc).timestamp() * 1000)}"
    run_id = f"subrun-{int(datetime.now(timezone.utc).timestamp() * 1000)}"

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

    tasks_input = [
        {"role": t.role, "prompt": t.prompt, "task_id": t.taskId, "provider": t.provider, "model": t.model}
        for t in (payload.tasks or [])
    ]

    async def event_generator():
        try:
            async for event in runtime.invoke_subagents_stream(
                thread_id=thread_id, run_id=run_id, prompt=payload.prompt,
                tasks=tasks_input, provider=provider, model=model,
                metadata={"user_id": payload.userId, **(payload.metadata or {})},
                enabled_skills=payload.enabledSkills,
                max_concurrency=payload.maxConcurrency,
                task_timeout_ms=payload.taskTimeoutMs,
                provider_configs=provider_configs,
            ):
                yield f"data: {json.dumps({'type': event.type, **{k: v for k, v in event.__dict__.items() if k != 'type'}})}\n\n"
        except Exception as exc:
            yield f"data: {json.dumps({'type': 'error', 'message': str(exc), 'at': _now_iso()})}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@router.get("/subruns/{run_id}", response_model=SubagentRunRecordResponse)
async def get_subrun(run_id: str, session: DbSession) -> SubagentRunRecordResponse:
    run = (
        await session.scalars(
            select(SubagentRunORM).where(SubagentRunORM.run_id == run_id)
        )
    ).first()
    if run is None:
        raise HTTPException(status_code=404, detail="Subagent run not found")

    tasks = (
        await session.scalars(
            select(SubagentTaskRunORM)
            .where(SubagentTaskRunORM.run_id == run_id)
            .order_by(SubagentTaskRunORM.created_at)
        )
    ).all()

    return SubagentRunRecordResponse(
        runId=run.run_id, threadId=run.thread_id, prompt=run.prompt,
        summary=run.summary, partial=run.partial, createdAt=run.created_at.isoformat(),
        results=[
            SubagentTaskResult(
                taskId=t.task_id, role=t.role, status=t.status, threadId=t.thread_id,
                provider=t.provider, model=t.model, output=t.output, error=t.error,
                checkpointId=t.checkpoint_id, startedAt=t.started_at.isoformat(),
                endedAt=t.ended_at.isoformat(), durationMs=t.duration_ms,
            )
            for t in tasks
        ],
    )
