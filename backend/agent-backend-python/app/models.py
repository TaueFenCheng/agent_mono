from typing import Any, Literal

from pydantic import BaseModel, Field

Role = Literal["system", "user", "assistant", "tool"]
Provider = Literal["openai", "anthropic", "gemini", "qwen", "glm"]


class ChatMessage(BaseModel):
    role: Role
    content: str
    createdAt: str


class AgentRunRequest(BaseModel):
    threadId: str | None = None
    sessionId: str | None = None
    userId: str | None = None
    messages: list[ChatMessage] = Field(default_factory=list)
    model: str | None = None
    provider: Provider | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    enabledSkills: list[str] | None = None


class AgentRunResponse(BaseModel):
    runId: str
    threadId: str
    output: str
    provider: str
    createdAt: str
    cached: bool = False
    checkpointId: str | None = None
    toolCount: int = 0


class RunRecordResponse(BaseModel):
    runId: str
    threadId: str
    prompt: str
    output: str
    provider: str
    model: str | None = None
    checkpointId: str | None = None
    createdAt: str


class ThreadSummaryResponse(BaseModel):
    thread_id: str
    created_at: str | None = None
    updated_at: str | None = None
    latest_checkpoint_id: str | None = None
    title: str | None = None


class ThreadListResponse(BaseModel):
    thread_list: list[ThreadSummaryResponse]


class ThreadDetailResponse(BaseModel):
    thread_id: str
    checkpoints: list[dict[str, Any]]


class MemoryFactResponse(BaseModel):
    id: str
    thread_id: str
    content: str
    category: str
    confidence: float
    metadata: dict[str, Any]
    created_at: str
    updated_at: str


class CreateMemoryFactRequest(BaseModel):
    content: str
    category: str = "context"
    confidence: float = 0.7
    metadata: dict[str, Any] = Field(default_factory=dict)


class ThreadMemoryResponse(BaseModel):
    thread_id: str
    facts: list[MemoryFactResponse]


class SkillResponse(BaseModel):
    name: str
    description: str
    path: str
    metadata: dict[str, Any]
    content: str | None = None


class SkillListResponse(BaseModel):
    skills: list[SkillResponse]


class McpPluginInfo(BaseModel):
    name: str


class McpPluginListResponse(BaseModel):
    plugins: list[McpPluginInfo]


class McpToolInfo(BaseModel):
    plugin: str
    name: str
    description: str


class McpToolListResponse(BaseModel):
    tools: list[McpToolInfo]


class InvokeMcpToolRequest(BaseModel):
    arguments: dict[str, Any] = Field(default_factory=dict)
    threadId: str | None = None
    runId: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class InvokeMcpToolResponse(BaseModel):
    plugin: str
    toolName: str
    output: Any


class HealthResponse(BaseModel):
    status: Literal["ok"]
    postgres: Literal["up", "down"]
    redis: Literal["up", "down"]
    checkpointer: Literal["memory", "postgres"]
    at: str
