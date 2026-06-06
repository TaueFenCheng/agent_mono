# tang-agent-core-python

Shared Python agent core for tangAgent.

中文文档: `README.zh-CN.md`

Included capabilities:

- LangChain + LangGraph runtime wrapper
- Provider routing for `qwen`, `glm`, `openai`, `anthropic`, and `gemini`
- Built-in tools plus MCP plugin/server injection
- File-based skill discovery from `SKILL.md`
- Thread memory backed by Postgres or in-memory storage
- LangGraph checkpointer factory with thread/checkpoint history helpers
- MCP runtime helper methods for listing plugins/tools and invoking tools

Default skills directory:

- `AGENT_SKILLS_DIR`, or
- `<repo>/skills`
