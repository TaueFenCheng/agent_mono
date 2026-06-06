from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Any

from langchain_core.tools import BaseTool, StructuredTool
from pydantic import BaseModel, Field

from .mcp import load_mcp_tools_from_env
from .types import McpToolPlugin, ToolBuildContext, ToolRegistry


class _EchoInput(BaseModel):
    text: str = Field(..., description="Text to echo back.")


class _CalcInput(BaseModel):
    expression: str = Field(..., description="Arithmetic expression using + - * / and parentheses.")


class _RememberFactInput(BaseModel):
    content: str = Field(..., description="Fact to remember for this thread.")
    category: str = Field(default="context", description="Memory fact category.")
    confidence: float = Field(default=0.7, ge=0.0, le=1.0, description="Confidence score for this memory.")


class _ReadSkillInput(BaseModel):
    name: str = Field(..., description="Skill name to read.")


def _to_string(value: Any) -> str:
    if isinstance(value, str):
        return value
    return json.dumps(value, ensure_ascii=False, indent=2)


class DefaultAgentToolRegistry(ToolRegistry):
    def __init__(self) -> None:
        self._plugins: list[McpToolPlugin] = []

    def use_mcp_plugin(self, plugin: McpToolPlugin) -> "DefaultAgentToolRegistry":
        self._plugins.append(plugin)
        return self

    async def build_mcp_tools(self) -> list[tuple[str, BaseTool]]:
        tools: dict[str, tuple[str, BaseTool]] = {}

        for plugin in self._plugins:
            for tool in await plugin.load_tools():
                tools.setdefault(tool.name, (plugin.name, tool))

        for tool in await load_mcp_tools_from_env():
            tools.setdefault(tool.name, ("mcp-server", tool))

        return list(tools.values())

    async def build_tools(self, context: ToolBuildContext) -> list[BaseTool]:
        tools: dict[str, BaseTool] = {}

        async def get_time() -> str:
            return datetime.now(UTC).isoformat()

        async def echo_text(text: str) -> str:
            return text

        async def calculate(expression: str) -> str:
            if not all(char in "0123456789+-*/(). " for char in expression):
                raise ValueError("Expression contains unsupported characters")
            result = eval(expression, {"__builtins__": {}}, {})
            if not isinstance(result, int | float):
                raise ValueError("Expression result is not numeric")
            return str(result)

        async def remember_fact(content: str, category: str = "context", confidence: float = 0.7) -> str:
            if context.memory_store is None:
                return "Memory store is not configured."
            fact = await context.memory_store.create_fact(
                context.thread_id,
                content=content,
                category=category,
                confidence=confidence,
                metadata=context.metadata,
            )
            return _to_string(
                {
                    "id": fact.id,
                    "thread_id": fact.thread_id,
                    "content": fact.content,
                    "category": fact.category,
                    "confidence": fact.confidence,
                }
            )

        async def list_memory() -> str:
            if context.memory_store is None:
                return "Memory store is not configured."
            facts = await context.memory_store.list_facts(context.thread_id, limit=20)
            return _to_string([fact.__dict__ for fact in facts])

        async def list_skills() -> str:
            if context.skill_registry is None:
                return "Skill registry is not configured."
            skills = context.skill_registry.list_skills(
                enabled_only=bool(context.enabled_skills),
                enabled_names=context.enabled_skills,
            )
            return _to_string(
                [
                    {"name": skill.name, "description": skill.description, "path": str(skill.path)}
                    for skill in skills
                ]
            )

        async def read_skill(name: str) -> str:
            if context.skill_registry is None:
                return "Skill registry is not configured."
            skill = context.skill_registry.get_skill(name)
            if skill is None:
                raise ValueError(f"Skill not found: {name}")
            return skill.content

        builtins = [
            StructuredTool.from_function(
                coroutine=get_time,
                name="get_time",
                description="Get the current UTC datetime in ISO-8601 format.",
            ),
            StructuredTool.from_function(
                coroutine=echo_text,
                name="echo_text",
                description="Echo input text for tool-calling validation.",
                args_schema=_EchoInput,
            ),
            StructuredTool.from_function(
                coroutine=calculate,
                name="calculate",
                description="Evaluate a basic arithmetic expression.",
                args_schema=_CalcInput,
            ),
            StructuredTool.from_function(
                coroutine=remember_fact,
                name="remember_fact",
                description="Persist a fact into thread memory for later turns.",
                args_schema=_RememberFactInput,
            ),
            StructuredTool.from_function(
                coroutine=list_memory,
                name="list_memory",
                description="List the saved memory facts for the current thread.",
            ),
            StructuredTool.from_function(
                coroutine=list_skills,
                name="list_skills",
                description="List the available skills and their summaries.",
            ),
            StructuredTool.from_function(
                coroutine=read_skill,
                name="read_skill",
                description="Read the full content of a skill by name.",
                args_schema=_ReadSkillInput,
            ),
        ]

        for tool in builtins:
            tools[tool.name] = tool

        for _, tool in await self.build_mcp_tools():
            tools.setdefault(tool.name, tool)

        return list(tools.values())
