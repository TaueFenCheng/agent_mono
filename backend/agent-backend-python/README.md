# agent-backend-python

FastAPI gateway over `core/agent-core-python`.

中文文档: `README.zh-CN.md`

## Included gateway APIs

- `POST /v1/agents/runs`
- `GET /v1/runs/{run_id}`
- `GET /v1/threads`
- `GET /v1/threads/{thread_id}`
- `GET /v1/threads/{thread_id}/checkpoints`
- `GET /v1/threads/{thread_id}/memory`
- `POST /v1/threads/{thread_id}/memory/facts`
- `DELETE /v1/threads/{thread_id}/memory/facts/{fact_id}`
- `GET /v1/skills`
- `GET /v1/skills/{skill_name}`
- `GET /v1/mcp/plugins`
- `GET /v1/mcp/tools`
- `POST /v1/mcp/tools/{tool_name}/invoke`

## Core capabilities

- LangChain + LangGraph orchestration
- Provider routing for `qwen`, `glm`, `openai`, `anthropic`, and `gemini`
- Built-in tools plus MCP plugin/server injection
- MCP tool listing and direct invocation gateway endpoints
- File-based skills loaded from `SKILL.md`
- Thread memory persistence
- LangGraph checkpointer-backed multi-turn thread recovery

## Environment variables

- `AGENT_PROVIDER`
- `AGENT_SYSTEM_PROMPT`
- `AGENT_TEMPERATURE`
- `AGENT_CHECKPOINTER_BACKEND`
- `AGENT_SKILLS_DIR`
- `AGENT_ENABLED_SKILLS`
- `AGENT_MCP_PLUGIN_MODULES`
- `AGENT_MCP_SERVERS_JSON` / `AGENT_MCP_SERVERS_FILE`
- `QWEN_API_KEY` / `QWEN_BASE_URL` / `QWEN_MODEL`
- `GLM_API_KEY` / `GLM_BASE_URL` / `GLM_MODEL`
- `OPENAI_API_KEY` / `OPENAI_BASE_URL` / `OPENAI_MODEL`
- `ANTHROPIC_API_KEY` / `ANTHROPIC_BASE_URL` / `ANTHROPIC_MODEL`
- `GEMINI_API_KEY` / `GEMINI_BASE_URL` / `GEMINI_MODEL`

## Setup (uv)

```bash
cd backend/agent-backend-python
uv sync --dev
```

## Run

```bash
uv run uvicorn app.main:app --reload --port 8081
```

## Test

```bash
uv run pytest -q
```
