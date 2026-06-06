# Agent Capabilities

中文版: `AGENT_CAPABILITIES.zh-CN.md`

## Core runtime capabilities

- LangChain + LangGraph ReAct runtime orchestration
- Tool registry with built-in tools, local tools, and MCP-injected tools
- Built-in tools: `get_time`, `echo_text`, `calculate`, `remember_fact`, `list_memory`, `list_skills`, `read_skill`
- Skills prompt-context injection from local `SKILL.md` files
- Thread-level memory operations with persistence adapters
- Thread/checkpoint history APIs via LangGraph checkpointer

## Model routing

- TypeScript core (`core/agent-core-ts`): `qwen`, `glm`, `openai`
- Python core (`core/agent-core-python`): `qwen`, `glm`, `openai`, `anthropic`, `gemini`

## MCP capabilities

- MCP plugin module loading via `AGENT_MCP_PLUGIN_MODULES`
- Tool listing and invocation at gateway layer
- TypeScript gateway endpoints: `GET /v1/mcp/plugins`, `GET /v1/mcp/tools`, `POST /v1/mcp/tools/:toolName/invoke`
- Python gateway endpoints: `GET /v1/mcp/plugins`, `GET /v1/mcp/tools`, `POST /v1/mcp/tools/{tool_name}/invoke`

## Persistence and cache

- PostgreSQL: run records (`agent_runs`), memory facts (`agent_memory_facts`), checkpointer backend (`postgres` mode)
- PostgreSQL: attachment metadata (`attachments`) and parsed chunks (`attachment_chunks`)
- Redis: health checks and run output cache keyed by provider/model/thread/message
- TypeScript backend: async job transport with BullMQ

## Attachments and retrieval (TS backend)

- Object storage upload with S3/MinIO compatibility (MinIO defaults)
- Async attachment pipeline queue: `attachment-process` (BullMQ worker)
- Parsing support: PDF (`pdf-parse`), Word (`mammoth`), code/text (UTF-8)
- OCR support: image text extraction via `tesseract.js` (runtime/language pack dependent)
- Search support over filename, full extracted text, and chunk content
- TS gateway endpoints:
- `POST /v1/attachments` (multipart upload)
- `GET /v1/attachments` (list by thread)
- `GET /v1/attachments/:attachmentId` (details + preview URL)
- `GET /v1/attachments/search?q=...` (full-text retrieval)
- `GET /v1/attachments/jobs/:jobId` (processing job status)

## Gateway/API parity

- Shared endpoints (TS + Python): `POST /v1/agents/runs`, `GET /v1/runs/:id`, `GET /v1/threads`, `GET /v1/threads/:threadId`, `GET /v1/threads/:threadId/checkpoints`, `GET /v1/threads/:threadId/memory`, `POST /v1/threads/:threadId/memory/facts`, `DELETE /v1/threads/:threadId/memory/facts/:factId`, `GET /v1/skills`, `GET /v1/skills/:skillName`, `GET /v1/mcp/plugins`, `GET /v1/mcp/tools`, `POST /v1/mcp/tools/<tool>/invoke`
- TypeScript-only endpoints currently: `POST /v1/agents/runs/stream` (SSE), `POST /v1/agents/runs/jobs`, `GET /v1/agents/runs/jobs/:jobId`

## Authentication (TS backend)

- Global JWT auth guard (Bearer token required by default)
- `@Public()` allowlist endpoints: `GET /health`, `POST /v1/auth/token`
- Token issuing endpoint: `POST /v1/auth/token`
- Optional bootstrap key gate: when `AUTH_BOOTSTRAP_KEY` is set, `x-bootstrap-key` is required to issue tokens

## Client surfaces

- Web app (`frontend/web`): basic run console
- CLI (`frontend/cli`): Ink interactive prompt client
- Desktop (`frontend/desktop-electron`): Electron shell
- Tauri project retained under `frontend/desktop`
