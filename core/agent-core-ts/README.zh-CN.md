# @intelligent-agent/agent-core

从后端运行时抽离出来的共享 Agent 核心能力层（TypeScript 版本）。

English docs: `README.md`

## 目录布局

- `ts/`：TypeScript 实现（当前主实现）
- Python 版本位于同级目录 `core/agent-core-python`

## 迁移后的能力基线（参考 deerflow）

- LangChain + LangGraph 编排抽象
- 按工具名去重的工具注册机制
- 内置工具启动与统一工具调用接口
- MCP 插件注入契约（`McpToolPlugin`）和运行时加载器

参考来源：

- `deerflow/tools/tools.py`（工具加载与去重模式）
- `deerflow/mcp/tools.py`（MCP 工具包装和可拦截调用流）

## TS 能力

- Provider 路由（`qwen/glm/openai`）与别名归一化
- 统一调用入口：`AgentCore.invoke()`
- `DefaultAgentToolRegistry` 支持 local + structured + MCP plugin 工具
- 运行时 MCP 插件加载：`loadMcpPluginsFromEnv()`
- 内置工具：时间/回显/计算/记忆/skills
- 基于 checkpointer 的线程历史能力：`listThreads`、`getThread`
- MCP 运行时能力：列出已加载插件、列出 MCP 工具、调用 MCP 工具
- 可注入的 `AgentRuntime` facade：统一组装 `AgentCore`、Memory、工具、checkpointer 和关闭资源

`AgentRuntime` 不依赖具体基础设施。TypeScript backend 通过依赖注入提供 Prisma Memory、checkpointer 以及宿主机/Sandbox 执行工具；这些实现不属于 Core 包。

## MCP 插件注入

设置环境变量：

```bash
AGENT_MCP_PLUGIN_MODULES=./path/to/plugin.mjs,package-name/plugin
```

每个插件模块需要导出以下之一：

- `default`（插件对象）
- 命名导出 `plugin`

并满足接口：

```ts
interface McpToolPlugin {
  name: string;
  loadTools: (context?: {
    invocationContext: { threadId?: string; runId?: string; metadata?: Record<string, unknown> };
    services?: Record<string, unknown>;
  }) => Promise<StructuredToolInterface[]>;
}
```
