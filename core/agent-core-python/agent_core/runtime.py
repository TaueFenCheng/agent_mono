from __future__ import annotations

import os
from typing import Any, Sequence

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage
from langgraph.checkpoint.base import BaseCheckpointSaver
from langgraph.prebuilt import create_react_agent

from .checkpointer import get_latest_checkpoint_id, get_thread_checkpoints, has_thread_history, list_threads
from .mcp import load_mcp_plugins_from_env
from .providers import create_routed_model
from .skills import SkillRegistry
from .tools import DefaultAgentToolRegistry
from .types import AgentCoreOptions, AgentInvokeInput, AgentInvokeOutput, MemoryStore, ToolBuildContext, ToolRegistry


def _extract_last_assistant_text(messages: Sequence[BaseMessage]) -> str:
    for message in reversed(messages):
        if not isinstance(message, AIMessage):
            continue
        content = message.content
        if isinstance(content, str):
            return content
        if isinstance(content, list):
            parts: list[str] = []
            for item in content:
                if isinstance(item, dict) and isinstance(item.get("text"), str):
                    parts.append(item["text"])
                else:
                    parts.append(str(item))
            return "\n".join(parts).strip()
        return str(content)
    return ""


class AgentCoreRuntime:
    def __init__(
        self,
        *,
        checkpointer: BaseCheckpointSaver,
        memory_store: MemoryStore | None = None,
        skill_registry: SkillRegistry | None = None,
        tool_registry: ToolRegistry | None = None,
        options: AgentCoreOptions | None = None,
    ) -> None:
        self._checkpointer = checkpointer
        self._memory_store = memory_store
        self._skill_registry = skill_registry or SkillRegistry()
        self._tool_registry = tool_registry or DefaultAgentToolRegistry()
        self._options = options or AgentCoreOptions()
        self._plugins_loaded = False

    async def _ensure_plugins_loaded(self) -> None:
        if self._plugins_loaded:
            return
        for plugin in await load_mcp_plugins_from_env():
            self._tool_registry.use_mcp_plugin(plugin)
        self._plugins_loaded = True

    async def invoke(self, payload: AgentInvokeInput) -> AgentInvokeOutput:
        await self._ensure_plugins_loaded()

        selected_provider, chat_model = create_routed_model(
            provider=payload.provider or self._options.default_provider,
            model=payload.model or self._options.default_model,
            default_model=self._options.default_model,
        )

        tools = await self._tool_registry.build_tools(
            ToolBuildContext(
                thread_id=payload.thread_id,
                metadata=payload.metadata,
                enabled_skills=payload.enabled_skills,
                memory_store=self._memory_store,
                skill_registry=self._skill_registry,
            )
        )

        prompt_sections = [
            self._options.system_prompt
            or os.getenv("AGENT_SYSTEM_PROMPT")
            or "You are a pragmatic software engineering agent. Use tools when needed and keep answers concrete.",
        ]

        if self._memory_store is not None:
            memory_context = await self._memory_store.render_prompt_context(payload.thread_id, limit=20)
            if memory_context:
                prompt_sections.append(memory_context)

        skill_context = self._skill_registry.render_prompt_context(enabled_names=payload.enabled_skills)
        if skill_context:
            prompt_sections.append(skill_context)

        graph = create_react_agent(
            model=chat_model,
            tools=tools,
            prompt="\n\n".join(section for section in prompt_sections if section),
            checkpointer=self._checkpointer,
            name="tang-agent-core-python",
        )

        has_history = await has_thread_history(self._checkpointer, payload.thread_id)
        input_messages: list[BaseMessage]
        if has_history:
            input_messages = [HumanMessage(content=payload.prompt)]
        else:
            input_messages = [HumanMessage(content=payload.prompt)]

        state = await graph.ainvoke(
            {"messages": input_messages},
            config={"configurable": {"thread_id": payload.thread_id, "run_id": payload.run_id or payload.thread_id}},
        )

        messages = list(state.get("messages", []))
        return AgentInvokeOutput(
            output=_extract_last_assistant_text(messages),
            provider=selected_provider,
            messages=messages,
            tool_count=len(tools),
            checkpoint_id=await get_latest_checkpoint_id(self._checkpointer, payload.thread_id),
        )

    async def list_threads(self, *, limit: int = 20) -> list[dict]:
        return await list_threads(self._checkpointer, limit=limit)

    async def get_thread(self, thread_id: str) -> dict:
        return {
            "thread_id": thread_id,
            "checkpoints": await get_thread_checkpoints(self._checkpointer, thread_id),
        }

    async def list_mcp_plugins(self) -> list[dict[str, str]]:
        await self._ensure_plugins_loaded()
        loaded = await self._tool_registry.build_mcp_tools()
        names = sorted({plugin for plugin, _ in loaded})
        return [{"name": name} for name in names]

    async def list_mcp_tools(
        self,
        *,
        thread_id: str | None = None,
        run_id: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> list[dict[str, str]]:
        await self._ensure_plugins_loaded()
        # Keep signature aligned with gateway API even when some MCP sources do not use context.
        _ = (thread_id, run_id, metadata)
        loaded = await self._tool_registry.build_mcp_tools()
        items = [{"plugin": plugin, "name": tool.name, "description": tool.description or ""} for plugin, tool in loaded]
        items.sort(key=lambda item: item["name"])
        return items

    async def invoke_mcp_tool(
        self,
        tool_name: str,
        *,
        arguments: dict[str, Any] | None = None,
        thread_id: str | None = None,
        run_id: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        await self._ensure_plugins_loaded()
        loaded = await self._tool_registry.build_mcp_tools()
        for plugin, tool in loaded:
            if tool.name == tool_name:
                payload = dict(arguments or {})
                payload.setdefault(
                    "_context",
                    {
                        "threadId": thread_id,
                        "runId": run_id,
                        "metadata": metadata or {},
                    },
                )
                output = await tool.ainvoke(payload)
                return {"plugin": plugin, "toolName": tool.name, "output": output}
        raise ValueError(f"MCP tool not found: {tool_name}")
