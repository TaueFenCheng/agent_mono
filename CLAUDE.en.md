# CLAUDE.md (English)

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Setup (first time)
cp .env.example .env
make setup              # starts Docker services, installs deps, pushes Prisma schema

# Infrastructure
make db-up              # docker compose up -d (PostgreSQL + Redis)
make db-down            # docker compose down
make db-push-ts         # push Prisma schema to DB

# TypeScript - install & test
pnpm install            # install all workspace deps
pnpm test               # run all workspace tests (vitest)
pnpm -r test            # same, across all packages
pnpm --filter <pkg> test  # single package, e.g. pnpm --filter @intelligent-agent/agent-core test

# Python - install & test
cd backend/agent-backend-python && uv sync --dev
cd backend/agent-backend-python && uv run pytest -q

# Build
make build-ts           # pnpm build (ordered: core-types → agent-core → sdk-ts → ui → backends → fronts)
make build-python       # uv run python -m compileall app

# Dev servers
make dev-web            # Next.js on :3000
make dev-api-ts         # NestJS on :8080
make dev-api-python     # FastAPI on :8081
make dev-cli            # Ink CLI
make dev-desktop        # Electron
```

## Project Structure

```
intelligentAgent/
├── core/
│   ├── agent-core-ts/          # TypeScript agent core (LangChain/LangGraph)
│   │   ├── ts/                 # Source modules
│   │   │   ├── agent.ts        # AgentCore class - invoke/invokeStream
│   │   │   ├── provider-router.ts  # Multi-LLM provider routing (Qwen, GLM, OpenAI)
│   │   │   ├── tools.ts        # Tool registry (built-in + local + MCP plugins)
│   │   │   ├── mcp.ts          # MCP (Model Context Protocol) plugin support
│   │   │   ├── memory.ts       # Memory stores (InMemoryMemoryStore, PostgresMemoryStore)
│   │   │   ├── skills.ts       # Skill loading from SKILL.md files
│   │   │   ├── checkpointer.ts # LangGraph checkpoint management (memory/PG)
│   │   │   ├── events.ts       # Async event queue for streaming
│   │   │   └── types.ts        # Core type definitions
│   │   └── test/               # Vitest tests
│   └── agent-core-python/      # Python equivalent of agent-core-ts
│       └── agent_core/
│           ├── runtime.py      # AgentCoreRuntime
│           ├── providers.py    # Provider routing (supports 5 providers)
│           ├── tools.py        # Tool registry
│           ├── memory.py       # Memory stores
│           └── ...
├── backend/
│   ├── agent-backend-ts/       # NestJS + Prisma + ioredis backend
│   └── agent-backend-python/   # FastAPI + SQLAlchemy + redis backend
├── frontend/
│   ├── web/                    # Next.js 15 web console (shadcn/ui + Tailwind)
│   ├── desktop-electron/       # Electron desktop app (default)
│   ├── desktop/                # Tauri desktop app (alternative)
│   └── cli/                    # Ink CLI (React-rendered terminal)
├── packages/
│   ├── core-types/             # Shared TS type definitions
│   ├── sdk-ts/                 # Client SDK for agent API
│   └── ui/                     # Shared React UI components
├── skills/                     # Agent skill definitions (SKILL.md files)
└── infra/
    └── docker-compose.yml      # PostgreSQL 16 + Redis 7
```

## Architecture

### Multi-provider LLM routing
Both TS and Python cores route requests to providers via environment config. Default provider is `qwen`. The TypeScript side uses `ChatOpenAI` for all OpenAI-compatible APIs (Qwen, GLM, OpenAI); Python uses native SDKs for Anthropic and Gemini as well.

### Agent execution
`AgentCore` / `AgentCoreRuntime` creates a LangGraph `createReactAgent` with tools, system prompt, memory context, and skill context. Conversation state is checkpointed to PostgreSQL (or in-memory). Supports streaming via `AsyncEventQueue`.

### Tool system
Three tool registration mechanisms:
1. **Built-in**: `get_time`, `echo_text`, `calculate`, `remember_fact`, `list_memory`, `list_skills`, `read_skill`
2. **Local tools**: Register via `registerLocalTool()` with Zod schema
3. **MCP plugins**: Load tools from external MCP servers via `useMcpPlugin()`

The current TS backend also provides host file tools (`read_file`, `write_file`, `list_files`, `execute_command`) and sandbox-only tools for the `coder` subagent (`sandbox_read_file`, `sandbox_write_file`, `sandbox_list_files`, `sandbox_execute_command`). `coder` subagents get an isolated workspace under `${AGENT_SANDBOX_ROOT:-.agent/sandboxes}` and only see the sandbox tool allowlist.

### Skill system
Loads `SKILL.md` files from `skills/`, `.claude/skills/` etc. Skills are markdown with YAML frontmatter. Enabled via `AGENT_ENABLED_SKILLS` env var.

### Memory
Thread-scoped "memory facts" persisted to PostgreSQL (`agent_memory_facts` table) or in-memory. Rendered as prompt context on each invocation.

### Provider support
- TypeScript: Qwen, GLM, OpenAI (all via OpenAI-compatible API)
- Python: Qwen, GLM, OpenAI, Anthropic, Gemini (native SDKs)

## Environment

Key env vars in `.env.example`:
- `AGENT_PROVIDER` - default LLM provider
- `AGENT_SYSTEM_PROMPT` - system prompt override
- `QWEN_API_KEY`, `GLM_API_KEY`, `OPENAI_API_KEY`, etc. - provider API keys
- `AGENT_CHECKPOINTER_BACKEND` - `memory` or `postgres`
- `AGENT_ENABLED_SKILLS` - comma-separated skill names
- `AGENT_MCP_SERVERS_JSON` - MCP server config
- `AGENT_SANDBOX_ROOT` - root directory for `coder` subagent workspace sandboxes
