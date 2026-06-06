from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Literal, Protocol, Sequence

from langchain_core.messages import BaseMessage
from langchain_core.tools import BaseTool

CoreProvider = Literal["openai", "qwen", "glm", "anthropic", "gemini"]


@dataclass(frozen=True)
class ProviderConfig:
    api_key_env: str
    base_url_env: str
    model_env: str
    default_base_url: str
    default_model: str


@dataclass(frozen=True)
class Skill:
    name: str
    description: str
    content: str
    path: Path
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class MemoryFact:
    id: str
    thread_id: str
    content: str
    category: str
    confidence: float
    metadata: dict[str, Any]
    created_at: str
    updated_at: str


@dataclass
class AgentInvokeInput:
    prompt: str
    thread_id: str
    provider: str | None = None
    model: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)
    enabled_skills: Sequence[str] | None = None
    run_id: str | None = None


@dataclass
class AgentInvokeOutput:
    output: str
    provider: CoreProvider
    messages: list[BaseMessage]
    tool_count: int
    checkpoint_id: str | None = None


@dataclass(frozen=True)
class AgentCoreOptions:
    system_prompt: str | None = None
    default_provider: str | None = None
    default_model: str | None = None


@dataclass(frozen=True)
class ToolBuildContext:
    thread_id: str
    metadata: dict[str, Any]
    enabled_skills: Sequence[str] | None
    memory_store: "MemoryStore | None" = None
    skill_registry: "SkillRegistryLike | None" = None


class MemoryStore(Protocol):
    async def list_facts(self, thread_id: str, *, limit: int = 50) -> list[MemoryFact]: ...

    async def create_fact(
        self,
        thread_id: str,
        *,
        content: str,
        category: str = "context",
        confidence: float = 0.7,
        metadata: dict[str, Any] | None = None,
    ) -> MemoryFact: ...

    async def delete_fact(self, thread_id: str, fact_id: str) -> bool: ...

    async def render_prompt_context(self, thread_id: str, *, limit: int = 20) -> str: ...


class McpToolPlugin(Protocol):
    name: str

    async def load_tools(self) -> list[BaseTool]: ...


class SkillRegistryLike(Protocol):
    def list_skills(
        self,
        *,
        enabled_only: bool = False,
        enabled_names: Sequence[str] | None = None,
    ) -> list[Skill]: ...

    def get_skill(self, name: str) -> Skill | None: ...

    def render_prompt_context(self, *, enabled_names: Sequence[str] | None = None) -> str: ...


class ToolRegistry(Protocol):
    def use_mcp_plugin(self, plugin: McpToolPlugin) -> "ToolRegistry": ...

    async def build_tools(self, context: ToolBuildContext) -> list[BaseTool]: ...

    async def build_mcp_tools(self) -> list[tuple[str, BaseTool]]: ...
