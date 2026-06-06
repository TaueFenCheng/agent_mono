# tangAgent

Monorepo with frontend/backend separation.

中文文档: `README.zh-CN.md`

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
