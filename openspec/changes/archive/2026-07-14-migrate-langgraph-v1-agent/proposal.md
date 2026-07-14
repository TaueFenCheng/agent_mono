## 为什么

共享的 TypeScript Agent Core 仍在使用 LangGraph 已弃用的 `createReactAgent` 预构建 Agent，而项目正在准备升级到 LangGraph v1。现在迁移可以移除弃用路径，使 Agent 执行逻辑与受支持的 LangChain v1 API 保持一致，避免依赖升级后旧集成更难维护。

## 变更内容

- 将两处使用 `createReactAgent` 的运行时构造逻辑替换为 LangChain v1 的 `createAgent`。
- 将 Agent 构造参数从 `llm`/`prompt` 调整为 `model`/`systemPrompt`，同时保持工具、checkpoint、名称、调用和流式执行行为不变。
- 将 TypeScript Agent Core 的 LangChain 依赖升级到兼容 v1 的版本。
- 增加或更新测试，覆盖迁移后的 Agent 构造、工具调用和流式执行行为。
- **BREAKING**：要求使用 LangGraph v1 支持的 Node.js 版本，即 Node.js 22 或更高版本。

## 能力范围

### 新增能力

- `langgraph-v1-agent-runtime`：通过受支持的 LangChain v1 Agent 工厂运行共享的 TypeScript Agent Core。

### 修改能力

无。本次是实现方式和依赖迁移，不计划改变产品层行为。

## 影响范围

- `core/agent-core-ts/ts/agent.ts` 及其测试。
- `core/agent-core-ts/package.json` 和 workspace lockfile。
- 所有调用共享 Agent Core 的 TypeScript 后端或前端路径，尤其是流式运行和带 checkpoint 的运行。
- 本地及 CI 的 Node.js 运行时版本要求。
