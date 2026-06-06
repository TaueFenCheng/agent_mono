# tangAgent

前后端分离的 Agent Monorepo。

English docs: `README.md`

## 目录结构

- `frontend/web`: Next.js + React + shadcn/ui 风格组件
- `frontend/desktop-electron`: Electron 桌面端（默认）
- `frontend/desktop`: Tauri 桌面端（保留）
- `frontend/cli`: Ink CLI
- `backend/agent-backend-ts`: NestJS + TypeScript 后端
- `backend/agent-backend-python`: FastAPI 后端（`uv` 管理）
- `core/agent-core-ts`: 共享 TS Agent Core 能力
- `core/agent-core-python`: 共享 Python Agent Core 能力
- `packages/*`: 其他共享 TS 包
- `infra/docker-compose.yml`: PostgreSQL + Redis

## 一键初始化

```bash
cp .env.example .env
make setup
```

## 启动服务

每个服务建议一个终端：

```bash
make dev-api-ts
make dev-api-python
make dev-web
make dev-cli
make dev-desktop
```

如果希望自动先启动后端，再启动前端：

```bash
make dev-web-full
make dev-desktop-full
```

可选：启动 Tauri 桌面端

```bash
make dev-desktop-tauri
```

## 构建与测试

```bash
make build
make test
```

## 当前 Agent 能力

- 基于 LangChain + LangGraph ReAct 的工具调用编排
- 多轮会话线程持久化（checkpointer 支持 `postgres` / `memory`）
- PostgreSQL 记忆事实持久化
- Redis 运行结果缓存
- Skills 目录发现（`skills`、`.agents/skills`、`.claude/skills`、`.codex/skills`）
- MCP 插件加载与 MCP 工具调用 API
- 多端形态：Web、Electron、CLI

能力细节和 TS/Python 接口对齐情况：

- `AGENT_CAPABILITIES.zh-CN.md`
- English: `AGENT_CAPABILITIES.md`

## 说明

- 你要求的是 “Next.js 4”，当前脚手架实际使用 `Next.js 15`，因为 Next.js 4 已过时且与现代 React/工具链不兼容。
