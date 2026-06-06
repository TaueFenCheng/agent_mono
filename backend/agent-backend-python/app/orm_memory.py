from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

from agent_core.types import MemoryFact
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from .db_models import AgentMemoryFactORM


def _now() -> datetime:
    return datetime.now(UTC)


def _to_memory_fact(row: AgentMemoryFactORM) -> MemoryFact:
    return MemoryFact(
        id=row.id,
        thread_id=row.thread_id,
        content=row.content,
        category=row.category,
        confidence=float(row.confidence),
        metadata=dict(row.metadata_json or {}),
        created_at=row.created_at.isoformat(),
        updated_at=row.updated_at.isoformat(),
    )


class SqlAlchemyMemoryStore:
    def __init__(self, session_factory: async_sessionmaker[AsyncSession]) -> None:
        self._session_factory = session_factory

    async def setup(self) -> None:
        # Schema lifecycle is handled via Base.metadata.create_all in app startup.
        return None

    async def list_facts(self, thread_id: str, *, limit: int = 50) -> list[MemoryFact]:
        async with self._session_factory() as session:
            rows = (
                await session.scalars(
                    select(AgentMemoryFactORM)
                    .where(AgentMemoryFactORM.thread_id == thread_id)
                    .order_by(AgentMemoryFactORM.created_at.desc())
                    .limit(limit)
                )
            ).all()
        return [_to_memory_fact(row) for row in rows]

    async def create_fact(
        self,
        thread_id: str,
        *,
        content: str,
        category: str = "context",
        confidence: float = 0.7,
        metadata: dict[str, Any] | None = None,
    ) -> MemoryFact:
        row = AgentMemoryFactORM(
            id=str(uuid.uuid4()),
            thread_id=thread_id,
            content=content,
            category=category,
            confidence=confidence,
            metadata_json=metadata or {},
            created_at=_now(),
            updated_at=_now(),
        )
        async with self._session_factory() as session:
            session.add(row)
            await session.commit()
            await session.refresh(row)
        return _to_memory_fact(row)

    async def delete_fact(self, thread_id: str, fact_id: str) -> bool:
        async with self._session_factory() as session:
            result = await session.execute(
                delete(AgentMemoryFactORM).where(
                    AgentMemoryFactORM.thread_id == thread_id,
                    AgentMemoryFactORM.id == fact_id,
                )
            )
            await session.commit()
        return bool((result.rowcount or 0) > 0)

    async def render_prompt_context(self, thread_id: str, *, limit: int = 20) -> str:
        facts = await self.list_facts(thread_id, limit=limit)
        if not facts:
            return ""

        lines = ["Known memory facts:"]
        for fact in facts:
            lines.append(f"- [{fact.category}] {fact.content}")
        return "\n".join(lines)
