## Why

当前 Agent 的通用运行编排与 backend 专属基础设施组装集中在同一个 runtime 文件中，导致 `core` 能力难以被 CLI、桌面端或其他 backend 复用，也让 core/backend 的依赖边界不清晰。现在抽离可注入的 Runtime 外壳，可以统一生命周期管理，同时保持 Prisma、Sandbox 和宿主机执行能力留在 backend。

## What Changes

- 在 `core/agent-core-ts` 中提供不依赖 Prisma、NestJS 或宿主机执行实现的 Runtime 创建能力。
- 将 Runtime 的依赖改为显式注入，包括工具注册器、MemoryStore、Checkpointer、SkillRegistry 和关闭回调。
- 将当前 backend runtime 改造成 backend composition/adaptor 层，负责 Prisma MemoryStore、模型配置、Sandbox/Host 工具和 checkpointer 初始化。
- 保持现有 backend 的 Agent、子 Agent、Skill、Memory、MCP 和线程 API 行为不变。
- 改进 Runtime 初始化/关闭的封装，避免 Core 直接依赖 backend 基础设施。

## Capabilities

### New Capabilities

- `core-agent-runtime`: 提供可注入依赖的通用 Agent Runtime 生命周期与调用封装。

### Modified Capabilities

无。

## Impact

- 影响 `core/agent-core-ts` 的公开导出和 backend runtime 初始化代码。
- 需要更新 TypeScript core/backend 测试与 workspace 构建验证。
- 不改变 HTTP API、SSE 事件协议、数据库 schema 或 provider 配置格式。
