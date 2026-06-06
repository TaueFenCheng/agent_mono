# agent-backend-python

基于 `core/agent-core-python` 的 FastAPI 网关服务。

English docs: `README.md`

## 已提供接口

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

## 核心能力

- LangChain + LangGraph 编排
- Provider 路由：`qwen`、`glm`、`openai`、`anthropic`、`gemini`
- 内置工具 + MCP 插件/服务注入
- MCP 工具列表和直连调用接口
- 从 `SKILL.md` 加载文件型 skills
- 线程 memory 持久化
- 基于 LangGraph checkpointer 的多轮线程恢复

## 环境变量

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

## 安装（uv）

```bash
cd backend/agent-backend-python
uv sync --dev
```

## 运行

```bash
uv run uvicorn app.main:app --reload --port 8081
```

## 测试

```bash
uv run pytest -q
```
