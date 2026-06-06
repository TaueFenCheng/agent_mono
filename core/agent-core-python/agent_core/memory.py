from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime
from typing import Any

import asyncpg

from .types import MemoryFact


def _now_iso() -> str:
    return datetime.now(UTC).isoformat()


def _as_memory_fact(row: asyncpg.Record) -> MemoryFact:
    return MemoryFact(
        id=str(row["id"]),
        thread_id=str(row["thread_id"]),
        content=str(row["content"]),
        category=str(row["category"]),
        confidence=float(row["confidence"]),
        metadata=dict(row["metadata"] or {}),
        created_at=row["created_at"].isoformat(),
        updated_at=row["updated_at"].isoformat(),
    )


class PostgresMemoryStore:
    def __init__(self, pool: asyncpg.Pool) -> None:
        self._pool = pool

    async def setup(self) -> None:
        async with self._pool.acquire() as conn:
            await conn.execute(
                """
                create table if not exists agent_memory_facts (
                  id text primary key,
                  thread_id text not null,
                  content text not null,
                  category text not null default 'context',
                  confidence double precision not null default 0.7,
                  metadata jsonb not null default '{}'::jsonb,
                  created_at timestamptz not null default now(),
                  updated_at timestamptz not null default now()
                )
                """
            )
            await conn.execute(
                "create index if not exists idx_agent_memory_thread_id on agent_memory_facts(thread_id, created_at desc)"
            )

    async def list_facts(self, thread_id: str, *, limit: int = 50) -> list[MemoryFact]:
        async with self._pool.acquire() as conn:
            rows = await conn.fetch(
                """
                select id, thread_id, content, category, confidence, metadata, created_at, updated_at
                from agent_memory_facts
                where thread_id = $1
                order by created_at desc
                limit $2
                """,
                thread_id,
                limit,
            )
        return [_as_memory_fact(row) for row in rows]

    async def create_fact(
        self,
        thread_id: str,
        *,
        content: str,
        category: str = "context",
        confidence: float = 0.7,
        metadata: dict[str, Any] | None = None,
    ) -> MemoryFact:
        fact_id = str(uuid.uuid4())
        now = _now_iso()
        async with self._pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                insert into agent_memory_facts(id, thread_id, content, category, confidence, metadata, created_at, updated_at)
                values($1, $2, $3, $4, $5, $6::jsonb, $7::timestamptz, $7::timestamptz)
                returning id, thread_id, content, category, confidence, metadata, created_at, updated_at
                """,
                fact_id,
                thread_id,
                content,
                category,
                confidence,
                json.dumps(metadata or {}, ensure_ascii=False),
                now,
            )
        if row is None:
            raise RuntimeError("Failed to persist memory fact")
        return _as_memory_fact(row)

    async def delete_fact(self, thread_id: str, fact_id: str) -> bool:
        async with self._pool.acquire() as conn:
            deleted = await conn.fetchval(
                "delete from agent_memory_facts where thread_id = $1 and id = $2 returning 1",
                thread_id,
                fact_id,
            )
        return deleted == 1

    async def render_prompt_context(self, thread_id: str, *, limit: int = 20) -> str:
        facts = await self.list_facts(thread_id, limit=limit)
        if not facts:
            return ""

        lines = ["Known memory facts:"]
        for fact in facts:
            lines.append(f"- [{fact.category}] {fact.content}")
        return "\n".join(lines)


class InMemoryMemoryStore:
    def __init__(self) -> None:
        self._facts: dict[str, list[MemoryFact]] = {}

    async def setup(self) -> None:
        return None

    async def list_facts(self, thread_id: str, *, limit: int = 50) -> list[MemoryFact]:
        return list(reversed(self._facts.get(thread_id, [])))[0:limit]

    async def create_fact(
        self,
        thread_id: str,
        *,
        content: str,
        category: str = "context",
        confidence: float = 0.7,
        metadata: dict[str, Any] | None = None,
    ) -> MemoryFact:
        now = _now_iso()
        fact = MemoryFact(
            id=str(uuid.uuid4()),
            thread_id=thread_id,
            content=content,
            category=category,
            confidence=confidence,
            metadata=metadata or {},
            created_at=now,
            updated_at=now,
        )
        self._facts.setdefault(thread_id, []).append(fact)
        return fact

    async def delete_fact(self, thread_id: str, fact_id: str) -> bool:
        facts = self._facts.get(thread_id, [])
        next_facts = [fact for fact in facts if fact.id != fact_id]
        deleted = len(next_facts) != len(facts)
        self._facts[thread_id] = next_facts
        return deleted

    async def render_prompt_context(self, thread_id: str, *, limit: int = 20) -> str:
        facts = await self.list_facts(thread_id, limit=limit)
        if not facts:
            return ""
        return "\n".join(["Known memory facts:"] + [f"- [{fact.category}] {fact.content}" for fact in facts])
