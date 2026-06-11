# intelligentAgent

前后端分离的 Agent Monorepo。

---

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
- `docs`: RSPress 文档站点（预览 `docs/` 下 Markdown）
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

## 文档预览

使用 RSPress 本地预览 `docs/` 目录下的技术文档：

```bash
make dev-doc    # 或 make dev-docs
# 或
pnpm docs:dev
```

浏览器访问 http://localhost:3002/（与 Web 端 `:3000` 端口分离）。构建静态站点：

```bash
pnpm docs:build
pnpm docs:preview
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

- 你要求的是 "Next.js 4"，当前脚手架实际使用 `Next.js 15`，因为 Next.js 4 已过时且与现代 React/工具链不兼容。

---

# intelligentAgent (English)

Monorepo with frontend/backend separation.

## Structure

- `frontend/web`: Next.js + React + shadcn/ui style components
- `frontend/desktop-electron`: Electron desktop shell (default)
- `frontend/desktop`: Tauri desktop shell (retained)
- `frontend/cli`: Ink CLI
- `backend/agent-backend-ts`: NestJS + TypeScript backend
- `backend/agent-backend-python`: FastAPI backend (`uv` managed)
- `core/agent-core-ts`: shared TypeScript agent core capabilities
- `core/agent-core-python`: shared Python agent core package
- `packages/*`: other shared TypeScript packages
- `infra/docker-compose.yml`: PostgreSQL + Redis

## One-command setup

```bash
cp .env.example .env
make setup
```

## Run services

Start each service in its own terminal:

```bash
make dev-api-ts
make dev-api-python
make dev-web
make dev-cli
make dev-desktop
```

If you want to auto-start backend first:

```bash
make dev-web-full
make dev-desktop-full
```

Optional Tauri desktop run:

```bash
make dev-desktop-tauri
```

## Build and test

```bash
make build
make test
```

## Current agent capabilities

- LangChain + LangGraph ReAct orchestration with tool-calling
- Multi-turn thread persistence with LangGraph checkpointer (`postgres` or `memory`)
- Memory fact persistence in PostgreSQL
- Redis-based run output cache
- Skills discovery from `SKILL.md` (`skills`, `.agents/skills`, `.claude/skills`, `.codex/skills`)
- MCP plugin loading and MCP tool invocation APIs
- Multi-client delivery: Web, Electron desktop shell, Ink CLI

Capability details and API parity:

- See `AGENT_CAPABILITIES.md`
- 中文版: `AGENT_CAPABILITIES.zh-CN.md`

## Notes

- You requested "Next.js 4"; this scaffold uses `Next.js 15` because Next.js 4 is deprecated and incompatible with modern React/tooling.
