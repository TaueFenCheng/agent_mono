from __future__ import annotations

import contextlib
import json
import os
from collections.abc import AsyncIterator
from typing import Any

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage, ToolMessage
from langgraph.checkpoint.base import BaseCheckpointSaver

POSTGRES_INSTALL = "langgraph-checkpoint-postgres is required for the postgres checkpointer."
POSTGRES_CONN_REQUIRED = "A postgres connection string is required for the postgres checkpointer backend."


@contextlib.asynccontextmanager
async def make_checkpointer(
    *,
    backend: str | None = None,
    connection_string: str | None = None,
) -> AsyncIterator[BaseCheckpointSaver]:
    selected = (backend or os.getenv("AGENT_CHECKPOINTER_BACKEND") or ("postgres" if connection_string else "memory")).strip().lower()

    if selected == "memory":
        from langgraph.checkpoint.memory import InMemorySaver

        yield InMemorySaver()
        return

    if selected == "postgres":
        try:
            from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
        except ImportError as exc:
            raise ImportError(POSTGRES_INSTALL) from exc

        if not connection_string:
            raise ValueError(POSTGRES_CONN_REQUIRED)

        async with AsyncPostgresSaver.from_conn_string(connection_string) as saver:
            await saver.setup()
            yield saver
        return

    raise ValueError(f"Unsupported checkpointer backend: {selected}")


def serialize_message(message: BaseMessage) -> dict[str, Any]:
    if isinstance(message, HumanMessage):
        role = "user"
    elif isinstance(message, AIMessage):
        role = "assistant"
    elif isinstance(message, SystemMessage):
        role = "system"
    elif isinstance(message, ToolMessage):
        role = "tool"
    else:
        role = "unknown"

    content = message.content
    if not isinstance(content, str):
        try:
            content = json.dumps(content, ensure_ascii=False)
        except TypeError:
            content = str(content)

    return {
        "role": role,
        "content": content,
        "type": message.__class__.__name__,
    }


async def list_threads(checkpointer: BaseCheckpointSaver, *, limit: int = 20) -> list[dict[str, Any]]:
    thread_info_map: dict[str, dict[str, Any]] = {}
    async for checkpoint in checkpointer.alist(None, limit=limit):
        cfg = checkpoint.config.get("configurable", {})
        thread_id = cfg.get("thread_id")
        if not thread_id:
            continue

        ts = checkpoint.checkpoint.get("ts")
        checkpoint_id = cfg.get("checkpoint_id")
        channel_values = checkpoint.checkpoint.get("channel_values", {})

        current = thread_info_map.get(thread_id)
        if current is None:
            thread_info_map[thread_id] = {
                "thread_id": thread_id,
                "created_at": ts,
                "updated_at": ts,
                "latest_checkpoint_id": checkpoint_id,
                "title": channel_values.get("title"),
            }
            continue

        if ts is not None:
            created_at = current.get("created_at")
            updated_at = current.get("updated_at")
            if created_at is None or ts < created_at:
                current["created_at"] = ts
            if updated_at is None or ts > updated_at:
                current["updated_at"] = ts
                current["latest_checkpoint_id"] = checkpoint_id
                current["title"] = channel_values.get("title")

    threads = list(thread_info_map.values())
    threads.sort(key=lambda item: item.get("created_at") or "", reverse=True)
    return threads[:limit]


async def get_thread_checkpoints(checkpointer: BaseCheckpointSaver, thread_id: str) -> list[dict[str, Any]]:
    config = {"configurable": {"thread_id": thread_id}}
    checkpoints: list[dict[str, Any]] = []
    async for checkpoint in checkpointer.alist(config):
        channel_values = dict(checkpoint.checkpoint.get("channel_values", {}))
        if "messages" in channel_values:
            channel_values["messages"] = [
                serialize_message(message) if isinstance(message, BaseMessage) else message
                for message in channel_values["messages"]
            ]

        cfg = checkpoint.config.get("configurable", {})
        parent_cfg = checkpoint.parent_config.get("configurable", {}) if checkpoint.parent_config else {}

        checkpoints.append(
            {
                "checkpoint_id": cfg.get("checkpoint_id"),
                "parent_checkpoint_id": parent_cfg.get("checkpoint_id"),
                "ts": checkpoint.checkpoint.get("ts"),
                "metadata": checkpoint.metadata,
                "values": channel_values,
                "pending_writes": [
                    {"task_id": item[0], "channel": item[1], "value": item[2]}
                    for item in getattr(checkpoint, "pending_writes", [])
                ],
            }
        )

    checkpoints.sort(key=lambda item: item.get("ts") or "")
    return checkpoints


async def get_latest_checkpoint_id(checkpointer: BaseCheckpointSaver, thread_id: str) -> str | None:
    checkpoints = await get_thread_checkpoints(checkpointer, thread_id)
    if not checkpoints:
        return None
    return checkpoints[-1].get("checkpoint_id")


async def has_thread_history(checkpointer: BaseCheckpointSaver, thread_id: str) -> bool:
    async for _ in checkpointer.alist({"configurable": {"thread_id": thread_id}}, limit=1):
        return True
    return False
