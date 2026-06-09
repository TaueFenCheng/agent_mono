# @intelligent-agent/agent-core

Core agent capability layer extracted from backend runtime concerns.

中文文档: `README.zh-CN.md`

## Directory layout

- `ts/`: TypeScript implementation (active)
- Python implementation now lives in sibling directory `core/agent-core-python`

## Migrated capability baseline (from deerflow patterns)

This package intentionally carries the same capability direction as the deerflow harness:

- LangChain + LangGraph orchestration abstraction
- Tool registry with dedupe-by-name behavior
- Built-in tool bootstrap and unified tool invocation interface
- MCP plugin injection contract (`McpToolPlugin`) and runtime loader

Reference inspirations:

- `deerflow/tools/tools.py` (tool loading + dedupe patterns)
- `deerflow/mcp/tools.py` (MCP tool wrapping + interceptor-friendly flow)

## TS capabilities

- Provider routing (`qwen/glm/openai`) with alias normalization
- `AgentCore.invoke()` unified run entry
- `DefaultAgentToolRegistry` for local + structured + MCP plugin tools
- `loadMcpPluginsFromEnv()` for runtime plugin injection
- Built-in tools for time/echo/calculate/memory/skills operations
- Checkpointer-backed thread history helpers (`listThreads`, `getThread`)
- MCP runtime methods: list loaded plugins, list MCP tools, invoke MCP tool

## MCP plugin injection

Set environment variable:

```bash
AGENT_MCP_PLUGIN_MODULES=./path/to/plugin.mjs,package-name/plugin
```

Each plugin module should export either:

- `default` (plugin object), or
- named export `plugin`

And satisfy:

```ts
interface McpToolPlugin {
  name: string;
  loadTools: (context?: {
    invocationContext: { threadId?: string; runId?: string; metadata?: Record<string, unknown> };
    services?: Record<string, unknown>;
  }) => Promise<StructuredToolInterface[]>;
}
```
