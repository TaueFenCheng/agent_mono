"""Memory endpoints."""

from __future__ import annotations

from fastapi import APIRouter

from ..deps import MemoryStoreDep
from ..models import CreateMemoryFactRequest, MemoryFactResponse, ThreadMemoryResponse

router = APIRouter(prefix="/v1/threads/{thread_id}/memory", tags=["memory"])


@router.get("", response_model=ThreadMemoryResponse)
async def list_memory(thread_id: str, store: MemoryStoreDep) -> ThreadMemoryResponse:
    facts = await store.list_facts(thread_id, limit=100)
    return ThreadMemoryResponse(
        thread_id=thread_id,
        facts=[MemoryFactResponse(**fact.__dict__) for fact in facts],
    )


@router.post("/facts", response_model=MemoryFactResponse)
async def create_memory_fact(
    thread_id: str,
    payload: CreateMemoryFactRequest,
    store: MemoryStoreDep,
) -> MemoryFactResponse:
    fact = await store.create_fact(
        thread_id,
        content=payload.content,
        category=payload.category,
        confidence=payload.confidence,
        metadata=payload.metadata,
    )
    return MemoryFactResponse(**fact.__dict__)


@router.delete("/facts/{fact_id}")
async def delete_memory_fact(thread_id: str, fact_id: str, store: MemoryStoreDep) -> dict:
    return {"deleted": await store.delete_fact(thread_id, fact_id)}
