## Context

`backend/agent-backend-ts/src/runtime/agent.runtime.ts` 目前既负责创建 `AgentCore`，又负责 Prisma memory、Postgres checkpointer、激活模型配置、宿主机工具和 sandbox 工具的组装。`core/agent-core-ts` 已经拥有 `AgentCore` 及相关抽象，但缺少一个可复用的 Runtime 生命周期封装。

约束是 Core 不得依赖 backend 的 Prisma schema、NestJS、Redis 或宿主机执行实现；backend 的现有 API 和事件协议必须保持兼容。

## Goals / Non-Goals

**Goals:**

- 在 Core 中提供依赖注入式 Runtime，统一暴露 Agent、流式 Agent、子 Agent、线程、Skill、Memory 和 MCP 调用。
- 保持 Core 只依赖已有的 `MemoryStore`、`BaseCheckpointSaver`、工具注册器等抽象。
- 将 backend runtime 收敛为组合根和适配层。
- 保持现有 backend 调用方不需要改变业务行为。

**Non-Goals:**

- 不改变 HTTP API、SSE 事件类型或数据库 schema。
- 不把 PrismaMemoryStore、SandboxManager、HostExecutionBackend 移入 Core。
- 不在本次变更中实现完整 LangChain callback 生命周期。

## Decisions

### 1. Core 提供 `createAgentRuntime` 和 `AgentRuntime`

新增 Core Runtime 类型和工厂。工厂接收工具注册器、MemoryStore、SkillRegistry、checkpointer 及关闭回调等依赖，并在内部创建 `AgentCore`。Runtime 的方法直接委托给 `AgentCore`，避免 Core 了解 Prisma 或具体部署方式。

备选方案：仅移动现有 facade。该方案仍会把 Prisma 类型和 backend 初始化耦合进 Core，因此不采用。

### 2. Backend 保留组合和基础设施适配

backend 继续创建 `PrismaMemoryStore`、checkpointer、Sandbox/Host 工具和 MCP 服务，并通过依赖注入传给 Core Runtime。激活模型配置查询继续留在 backend，因为它依赖 Prisma 的 `modelConfig` 表。

备选方案：Core 接收 PrismaClient 并自行查询配置。该方案会破坏包边界，因此不采用。

### 3. 兼容现有 backend facade

现有 `getAgentRuntime(prisma)`、`invokeAgent` 等导出先保留在 backend，内部改为调用 Core 工厂。这样 Controller、Queue Processor 和 Subagent Service 不需要同时迁移。

### 4. Runtime 生命周期由实例管理

Core Runtime 暴露 `close()`，由 backend 组合根负责调用。backend 仍可提供进程级缓存，但 Runtime 本身不依赖模块级全局状态。

## Risks / Trade-offs

- [Risk] 公开导出新增类型后可能触发 workspace 构建顺序问题 → 先更新 core index/export，再运行 core 和 backend TypeScript 构建。
- [Risk] backend 工具注册逻辑迁移时遗漏某个工具 → 保留现有工具白名单和注册顺序，并通过现有测试及类型检查验证。
- [Risk] 旧 facade 与新 Runtime 参数不完全一致 → 让 facade 继续负责请求参数归一化和 active model config 注入，Core 只接收已经解析的输入。

## Migration Plan

1. 新增 Core Runtime 抽象、工厂和导出。
2. 将 backend 的 `createCore` 改为构造 backend 依赖后调用 Core 工厂。
3. 保留 backend facade，逐步把调用委托给 Runtime 实例。
4. 运行 core/backend 测试和构建；验证关闭流程。
5. 如需回滚，只需恢复 backend runtime 使用 `new AgentCore(...)` 的旧组装逻辑，HTTP/API 数据无需迁移。

## Open Questions

无。
