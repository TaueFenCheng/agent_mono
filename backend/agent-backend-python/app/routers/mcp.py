"""MCP (Model Context Protocol) endpoints."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from ..deps import AgentRuntime
from ..models import (
    InvokeMcpToolRequest,
    InvokeMcpToolResponse,
    McpPluginInfo,
    McpPluginListResponse,
    McpToolInfo,
    McpToolListResponse,
)

router = APIRouter(prefix="/v1/mcp", tags=["mcp"])


@router.get("/plugins", response_model=McpPluginListResponse)
async def list_mcp_plugins(runtime: AgentRuntime) -> McpPluginListResponse:
    plugins = await runtime.list_mcp_plugins()
    return McpPluginListResponse(plugins=[McpPluginInfo(**p) for p in plugins])


@router.get("/tools", response_model=McpToolListResponse)
async def list_mcp_tools(
    runtime: AgentRuntime,
    threadId: str | None = None,
    runId: str | None = None,
) -> McpToolListResponse:
    tools = await runtime.list_mcp_tools(thread_id=threadId, run_id=runId, metadata={})
    return McpToolListResponse(tools=[McpToolInfo(**t) for t in tools])


@router.post("/tools/{tool_name}/invoke", response_model=InvokeMcpToolResponse)
async def invoke_mcp_tool(
    tool_name: str,
    payload: InvokeMcpToolRequest,
    runtime: AgentRuntime,
) -> InvokeMcpToolResponse:
    try:
        result = await runtime.invoke_mcp_tool(
            tool_name,
            arguments=payload.arguments,
            thread_id=payload.threadId,
            run_id=payload.runId,
            metadata=payload.metadata,
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return InvokeMcpToolResponse(**result)
