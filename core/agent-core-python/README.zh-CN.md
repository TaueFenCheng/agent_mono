# intelligent-agent-core-python

intelligentAgent 的共享 Python Agent Core 包。

English docs: `README.md`

## 已包含能力

- LangChain + LangGraph 运行时封装
- Provider 路由：`qwen`、`glm`、`openai`、`anthropic`、`gemini`
- 内置工具 + MCP 插件/服务注入
- 基于 `SKILL.md` 的文件型 skills 发现
- 基于 Postgres 或内存的线程 memory 存储
- LangGraph checkpointer 工厂与线程/检查点历史辅助能力
- MCP 运行时辅助方法（列出插件/工具、调用工具）

## 默认 skills 目录

- `AGENT_SKILLS_DIR`
- `<repo>/skills`
