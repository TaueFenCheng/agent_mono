"""Thread endpoints."""

from __future__ import annotations

from fastapi import APIRouter

from ..deps import AgentRuntime
from ..models import ThreadDetailResponse, ThreadListResponse

router = APIRouter(prefix="/v1/threads", tags=["threads"])


@router.get("", response_model=ThreadListResponse)
async def list_threads(runtime: AgentRuntime, limit: int = 20) -> ThreadListResponse:
    threads = await runtime.list_threads(limit=min(limit, 200))
    return ThreadListResponse(thread_list=threads)


@router.get("/{thread_id}", response_model=ThreadDetailResponse)
async def get_thread(thread_id: str, runtime: AgentRuntime) -> ThreadDetailResponse:
    thread = await runtime.get_thread(thread_id)
    return ThreadDetailResponse(**thread)


@router.get("/{thread_id}/checkpoints", response_model=ThreadDetailResponse)
async def get_thread_checkpoints(thread_id: str, runtime: AgentRuntime) -> ThreadDetailResponse:
    thread = await runtime.get_thread(thread_id)
    return ThreadDetailResponse(**thread)
