# agent-backend-python

基于 `core/agent-core-python` 的 FastAPI 网关服务，与 TS 后端 (`agent-backend-ts`) 能力对齐。

---

## 项目结构

```
app/
├── main.py              # 应用入口，模块组装
├── config.py            # pydantic-settings 配置管理
├── deps.py              # FastAPI 依赖注入
├── exceptions.py        # 全局异常处理 + 错误码
├── middleware.py         # 请求日志 + requestId
├── models.py            # Pydantic 请求/响应模型
├── db_models.py         # SQLAlchemy ORM 模型（7 张表）
├── orm_memory.py        # 内存事实存储适配器
├── auth/
│   ├── service.py       # JWT 创建/验证
│   └── router.py        # POST /v1/auth/token
└── routers/
    ├── health.py        # 健康检查
    ├── agent.py         # Agent 运行（同步 + SSE 流式）
    ├── threads.py       # 会话线程
    ├── memory.py        # 记忆 CRUD
    ├── skills.py        # 技能列表/详情
    ├── mcp.py           # MCP 插件/工具
    ├── subagent.py      # 子 Agent（同步 + 流式 + 详情）
    ├── model_configs.py # 模型配置 CRUD + 激活
    ├── providers.py     # Provider 列表
    └── attachments.py   # 附件上传/列表/搜索/详情
```

## 已提供接口（31 个）

### 认证
| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/v1/auth/token` | Bootstrap Key 换取 JWT Token |

### Agent 运行
| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/v1/agents/runs` | 同步执行 Agent |
| `POST` | `/v1/agents/runs/stream` | SSE 流式执行 Agent |
| `GET` | `/v1/runs/{run_id}` | 查询运行记录 |

### 子 Agent
| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/v1/agents/subruns` | 同步执行子 Agent（最多 8 任务） |
| `POST` | `/v1/agents/subruns/stream` | SSE 流式执行子 Agent |
| `GET` | `/v1/subruns/{run_id}` | 查询子 Agent 运行记录 |

### 会话线程
| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/v1/threads` | 列出线程 |
| `GET` | `/v1/threads/{thread_id}` | 线程详情 |
| `GET` | `/v1/threads/{thread_id}/checkpoints` | 线程检查点 |

### 记忆
| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/v1/threads/{thread_id}/memory` | 列出记忆事实 |
| `POST` | `/v1/threads/{thread_id}/memory/facts` | 创建记忆事实 |
| `DELETE` | `/v1/threads/{thread_id}/memory/facts/{fact_id}` | 删除记忆事实 |

### 技能
| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/v1/skills` | 列出技能 |
| `GET` | `/v1/skills/{skill_name}` | 技能详情 |

### MCP
| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/v1/mcp/plugins` | 列出 MCP 插件 |
| `GET` | `/v1/mcp/tools` | 列出 MCP 工具 |
| `POST` | `/v1/mcp/tools/{tool_name}/invoke` | 调用 MCP 工具 |

### 模型配置
| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/v1/model-configs` | 列出所有配置 |
| `GET` | `/v1/model-configs/active` | 获取激活配置 |
| `GET` | `/v1/model-configs/{id}` | 获取单个配置 |
| `POST` | `/v1/model-configs` | 创建配置 |
| `PUT` | `/v1/model-configs/{id}` | 更新配置 |
| `DELETE` | `/v1/model-configs/{id}` | 删除配置 |
| `POST` | `/v1/model-configs/{id}/activate` | 激活配置 |

### Provider
| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/v1/providers` | 列出内置 Provider |

### 附件
| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/v1/attachments` | 上传文件（S3 存储） |
| `GET` | `/v1/attachments` | 列出附件 |
| `GET` | `/v1/attachments/search` | 全文搜索附件 |
| `GET` | `/v1/attachments/{id}` | 附件详情 + 签名 URL |

### 健康检查
| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/health` | 服务健康状态（Postgres/Redis/Checkpointer） |

## 核心能力

- JWT 认证（Bootstrap Key → Token）
- LangChain + LangGraph ReAct 编排
- 子 Agent 多角色协作（planner/researcher/coder）
- SSE 流式输出（Agent + Subagent）
- 模型配置管理（CRUD + 动态激活切换）
- S3/MinIO 附件存储 + 全文搜索
- MCP 插件加载与工具调用
- 文件型 Skills（`SKILL.md`）
- 线程记忆持久化
- LangGraph Checkpointer 多轮会话恢复
- CORS 支持
- 请求日志 + RequestId 追踪
- 统一异常处理 + 错误码

## 环境变量

### 基础设施
| 变量 | 默认值 | 说明 |
|------|--------|------|
| `POSTGRES_URL` | - | PostgreSQL 连接 URL（优先） |
| `POSTGRES_HOST` | `127.0.0.1` | PostgreSQL 主机 |
| `POSTGRES_PORT` | `5432` | PostgreSQL 端口 |
| `POSTGRES_USER` | `intelligent` | PostgreSQL 用户 |
| `POSTGRES_PASSWORD` | `intelligent` | PostgreSQL 密码 |
| `POSTGRES_DB` | `intelligent_agent` | PostgreSQL 数据库 |
| `REDIS_URL` | `redis://127.0.0.1:6379` | Redis 连接 URL |

### 认证
| 变量 | 默认值 | 说明 |
|------|--------|------|
| `JWT_SECRET` | `change-me-in-production` | JWT 签名密钥 |
| `JWT_EXPIRES_IN` | `7d` | Token 过期时间 |
| `AUTH_BOOTSTRAP_KEY` | - | Bootstrap Key（空=跳过验证） |

### Agent
| 变量 | 默认值 | 说明 |
|------|--------|------|
| `AGENT_PROVIDER` | `qwen` | 默认 LLM Provider |
| `AGENT_SYSTEM_PROMPT` | (内置) | 系统提示词 |
| `AGENT_CHECKPOINTER_BACKEND` | `postgres` | Checkpointer 后端 |

### 对象存储
| 变量 | 默认值 | 说明 |
|------|--------|------|
| `OBJECT_STORAGE_ENDPOINT` | `http://127.0.0.1:9000` | S3/MinIO 地址 |
| `OBJECT_STORAGE_BUCKET` | `intelligent-agent` | 存储桶名 |
| `OBJECT_STORAGE_ACCESS_KEY` | `minioadmin` | Access Key |
| `OBJECT_STORAGE_SECRET_KEY` | `minioadmin` | Secret Key |

### Provider API Keys
| 变量 | 说明 |
|------|------|
| `QWEN_API_KEY` / `QWEN_BASE_URL` / `QWEN_MODEL` | 通义千问 |
| `GLM_API_KEY` / `GLM_BASE_URL` / `GLM_MODEL` | 智谱 GLM |
| `DEEPSEEK_API_KEY` / `DEEPSEEK_BASE_URL` / `DEEPSEEK_MODEL` | DeepSeek |
| `OPENAI_API_KEY` / `OPENAI_BASE_URL` / `OPENAI_MODEL` | OpenAI |
| `ANTHROPIC_API_KEY` / `ANTHROPIC_BASE_URL` / `ANTHROPIC_MODEL` | Anthropic |
| `GEMINI_API_KEY` / `GEMINI_BASE_URL` / `GEMINI_MODEL` | Google Gemini |

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

## 数据库模型

| 表名 | 说明 |
|------|------|
| `agent_runs` | Agent 运行记录 |
| `agent_memory_facts` | 线程记忆事实 |
| `subagent_runs` | 子 Agent 运行记录 |
| `subagent_task_runs` | 子 Agent 任务结果 |
| `model_configs` | LLM 模型配置 |
| `attachments` | 附件元数据 |
| `attachment_chunks` | 附件文本分块 |

---

# agent-backend-python (English)

FastAPI gateway over `core/agent-core-python`, aligned with the TS backend (`agent-backend-ts`).

## Project Structure

```
app/
├── main.py              # App entry, module assembly
├── config.py            # pydantic-settings configuration
├── deps.py              # FastAPI dependency injection
├── exceptions.py        # Global exception handling + error codes
├── middleware.py         # Request logging + requestId
├── models.py            # Pydantic request/response schemas
├── db_models.py         # SQLAlchemy ORM models (7 tables)
├── orm_memory.py        # Memory fact store adapter
├── auth/
│   ├── service.py       # JWT create/verify
│   └── router.py        # POST /v1/auth/token
└── routers/
    ├── health.py        # Health check
    ├── agent.py         # Agent run (sync + SSE stream)
    ├── threads.py       # Conversation threads
    ├── memory.py        # Memory CRUD
    ├── skills.py        # Skill list/detail
    ├── mcp.py           # MCP plugins/tools
    ├── subagent.py      # Subagent (sync + stream + detail)
    ├── model_configs.py # Model config CRUD + activate
    ├── providers.py     # Provider list
    └── attachments.py   # Attachment upload/list/search/detail
```

## API Endpoints (31 total)

### Authentication
| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/v1/auth/token` | Exchange bootstrap key for JWT token |

### Agent
| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/v1/agents/runs` | Synchronous agent execution |
| `POST` | `/v1/agents/runs/stream` | SSE streaming agent execution |
| `GET` | `/v1/runs/{run_id}` | Get run record |

### Subagent
| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/v1/agents/subruns` | Synchronous subagent execution (up to 8 tasks) |
| `POST` | `/v1/agents/subruns/stream` | SSE streaming subagent execution |
| `GET` | `/v1/subruns/{run_id}` | Get subagent run record |

### Threads
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/threads` | List threads |
| `GET` | `/v1/threads/{thread_id}` | Thread detail |
| `GET` | `/v1/threads/{thread_id}/checkpoints` | Thread checkpoints |

### Memory
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/threads/{thread_id}/memory` | List memory facts |
| `POST` | `/v1/threads/{thread_id}/memory/facts` | Create memory fact |
| `DELETE` | `/v1/threads/{thread_id}/memory/facts/{fact_id}` | Delete memory fact |

### Skills
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/skills` | List skills |
| `GET` | `/v1/skills/{skill_name}` | Skill detail |

### MCP
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/mcp/plugins` | List MCP plugins |
| `GET` | `/v1/mcp/tools` | List MCP tools |
| `POST` | `/v1/mcp/tools/{tool_name}/invoke` | Invoke MCP tool |

### Model Configs
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/model-configs` | List all configs |
| `GET` | `/v1/model-configs/active` | Get active config |
| `GET` | `/v1/model-configs/{id}` | Get config by ID |
| `POST` | `/v1/model-configs` | Create config |
| `PUT` | `/v1/model-configs/{id}` | Update config |
| `DELETE` | `/v1/model-configs/{id}` | Delete config |
| `POST` | `/v1/model-configs/{id}/activate` | Activate config |

### Providers
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/providers` | List built-in providers |

### Attachments
| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/v1/attachments` | Upload file (S3 storage) |
| `GET` | `/v1/attachments` | List attachments |
| `GET` | `/v1/attachments/search` | Full-text search |
| `GET` | `/v1/attachments/{id}` | Attachment detail + signed URL |

### Health
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Service health (Postgres/Redis/Checkpointer) |

## Core Capabilities

- JWT authentication (Bootstrap Key → Token)
- LangChain + LangGraph ReAct orchestration
- Subagent multi-role collaboration (planner/researcher/coder)
- SSE streaming (Agent + Subagent)
- Model config management (CRUD + dynamic activation)
- S3/MinIO attachment storage + full-text search
- MCP plugin loading and tool invocation
- File-based Skills (`SKILL.md`)
- Thread memory persistence
- LangGraph Checkpointer multi-turn recovery
- CORS support
- Request logging + RequestId tracing
- Unified exception handling + error codes

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

## Database Models

| Table | Description |
|-------|-------------|
| `agent_runs` | Agent run records |
| `agent_memory_facts` | Thread memory facts |
| `subagent_runs` | Subagent run records |
| `subagent_task_runs` | Subagent task results |
| `model_configs` | LLM model configurations |
| `attachments` | Attachment metadata |
| `attachment_chunks` | Attachment text chunks |
