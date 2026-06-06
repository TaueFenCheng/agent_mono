# Agent 能力清单

English version: `AGENT_CAPABILITIES.md`

## 核心运行时能力

- LangChain + LangGraph ReAct 运行时编排
- 工具注册中心（内置工具、本地工具、MCP 注入工具）
- 内置工具：`get_time`、`echo_text`、`calculate`、`remember_fact`、`list_memory`、`list_skills`、`read_skill`
- 基于本地 `SKILL.md` 的 skills 提示注入
- 线程级 memory 操作与持久化适配
- 基于 LangGraph checkpointer 的线程/检查点历史查询

## 模型路由能力

- TypeScript core（`core/agent-core-ts`）：`qwen`、`glm`、`openai`
- Python core（`core/agent-core-python`）：`qwen`、`glm`、`openai`、`anthropic`、`gemini`

## MCP 能力

- 通过 `AGENT_MCP_PLUGIN_MODULES` 加载 MCP 插件模块
- 在网关层支持 MCP 工具查询和调用
- TypeScript 网关接口：`GET /v1/mcp/plugins`、`GET /v1/mcp/tools`、`POST /v1/mcp/tools/:toolName/invoke`
- Python 网关接口：`GET /v1/mcp/plugins`、`GET /v1/mcp/tools`、`POST /v1/mcp/tools/{tool_name}/invoke`

## 持久化与缓存

- PostgreSQL：运行记录（`agent_runs`）、记忆事实（`agent_memory_facts`）、checkpointer（`postgres` 模式）
- PostgreSQL：附件元数据（`attachments`）与解析分块（`attachment_chunks`）
- Redis：健康检查、按 provider/model/thread/message 组合键的运行结果缓存
- TypeScript 后端：基于 BullMQ 的异步任务队列

## 附件与检索能力（TS Backend）

- 对象存储：S3/MinIO 兼容上传（默认 MinIO 配置）
- 附件异步处理队列：`attachment-process`（BullMQ worker）
- 解析能力：PDF（`pdf-parse`）、Word（`mammoth`）、代码/文本（UTF-8）
- OCR 能力：图片通过 `tesseract.js` 提取文本（依赖运行环境和语言包）
- 附件检索：按文件名、全文、分块内容搜索
- TS 网关接口：
- `POST /v1/attachments`（multipart 上传）
- `GET /v1/attachments`（按线程列出）
- `GET /v1/attachments/:attachmentId`（详情+预览 URL）
- `GET /v1/attachments/search?q=...`（全文检索）
- `GET /v1/attachments/jobs/:jobId`（处理任务状态）

## Gateway 接口对齐

- TS + Python 共享接口：`POST /v1/agents/runs`、`GET /v1/runs/:id`、`GET /v1/threads`、`GET /v1/threads/:threadId`、`GET /v1/threads/:threadId/checkpoints`、`GET /v1/threads/:threadId/memory`、`POST /v1/threads/:threadId/memory/facts`、`DELETE /v1/threads/:threadId/memory/facts/:factId`、`GET /v1/skills`、`GET /v1/skills/:skillName`、`GET /v1/mcp/plugins`、`GET /v1/mcp/tools`、`POST /v1/mcp/tools/<tool>/invoke`
- 当前仅 TS 提供：`POST /v1/agents/runs/stream`（SSE）、`POST /v1/agents/runs/jobs`、`GET /v1/agents/runs/jobs/:jobId`

## 鉴权能力（TS Backend）

- 全局 JWT 鉴权 Guard（默认所有接口需 Bearer Token）
- `@Public()` 白名单：`GET /health`、`POST /v1/auth/token`
- Token 签发接口：`POST /v1/auth/token`
- 可选 bootstrap key：当配置 `AUTH_BOOTSTRAP_KEY` 时，签发接口需请求头 `x-bootstrap-key`

## 客户端形态

- Web（`frontend/web`）：基础运行控制台
- CLI（`frontend/cli`）：Ink 交互式命令行客户端
- Desktop（`frontend/desktop-electron`）：Electron 桌面壳
- Tauri 项目保留于 `frontend/desktop`
