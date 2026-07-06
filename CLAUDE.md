# CLAUDE.md

本文件为 Claude Code (claude.ai/code) 在此仓库中工作时提供指引。

## 常用命令

```bash
# 首次初始化
cp .env.example .env
make setup              # 启动 Docker 服务、安装依赖、推送 Prisma schema

# 基础设施
make db-up              # docker compose up -d（PostgreSQL + Redis）
make db-down            # docker compose down
make db-push-ts         # 推送 Prisma schema 到数据库

# TypeScript - 安装与测试
pnpm install            # 安装所有 workspace 依赖
pnpm test               # 运行所有 workspace 测试（vitest）
pnpm -r test            # 同上，遍历所有包
pnpm --filter <pkg> test  # 单包测试，如 pnpm --filter @intelligent-agent/agent-core test

# Python - 安装与测试
cd backend/agent-backend-python && uv sync --dev
cd backend/agent-backend-python && uv run pytest -q

# 构建
make build-ts           # pnpm build（构建顺序：core-types → agent-core → sdk-ts → ui → 后端 → 前端）
make build-python       # uv run python -m compileall app

# 开发服务器
make dev-web            # Next.js on :3000
make dev-api-ts         # NestJS on :8080
make dev-api-python     # FastAPI on :8081
make dev-cli            # Ink CLI
make dev-desktop        # Electron
```

## 项目结构

```
intelligentAgent/
├── core/
│   ├── agent-core-ts/          # TypeScript Agent 核心（LangChain/LangGraph）
│   │   ├── ts/                 # 源码模块
│   │   │   ├── agent.ts        # AgentCore 类 - invoke/invokeStream
│   │   │   ├── provider-router.ts  # 多 LLM Provider 路由（Qwen, GLM, OpenAI）
│   │   │   ├── tools.ts        # 工具注册器（内置 + 本地 + MCP 插件）
│   │   │   ├── mcp.ts          # MCP（Model Context Protocol）插件支持
│   │   │   ├── memory.ts       # 记忆存储（InMemoryMemoryStore, PostgresMemoryStore）
│   │   │   ├── skills.ts       # 从 SKILL.md 文件加载技能
│   │   │   ├── checkpointer.ts # LangGraph Checkpoint 管理（内存/PG）
│   │   │   ├── events.ts       # 异步事件队列（流式输出）
│   │   │   └── types.ts        # 核心类型定义
│   │   └── test/               # Vitest 测试
│   └── agent-core-python/      # agent-core-ts 的 Python 对等实现
│       └── agent_core/
│           ├── runtime.py      # AgentCoreRuntime
│           ├── providers.py    # Provider 路由（支持 5 个 Provider）
│           ├── tools.py        # 工具注册器
│           ├── memory.py       # 记忆存储
│           └── ...
├── backend/
│   ├── agent-backend-ts/       # NestJS + Prisma + ioredis 后端
│   └── agent-backend-python/   # FastAPI + SQLAlchemy + redis 后端
├── frontend/
│   ├── web/                    # Next.js 15 Web 控制台（shadcn/ui + Tailwind）
│   ├── desktop-electron/       # Electron 桌面应用（默认）
│   ├── desktop/                # Tauri 桌面应用（备选）
│   └── cli/                    # Ink CLI（React 渲染终端界面）
├── packages/
│   ├── core-types/             # 共享 TS 类型定义
│   ├── sdk-ts/                 # Agent API 客户端 SDK
│   └── ui/                     # 共享 React UI 组件
├── skills/                     # Agent 技能定义（SKILL.md 文件）
└── infra/
    └── docker-compose.yml      # PostgreSQL 16 + Redis 7
```

## 架构说明

### 多 Provider LLM 路由
TS 和 Python 两端均通过环境变量配置将请求路由到不同 LLM 提供商。默认 Provider 为 `qwen`。TypeScript 侧对所有兼容 OpenAI 接口的 API（Qwen、GLM、OpenAI）统一使用 `ChatOpenAI`；Python 侧对 Anthropic 和 Gemini 使用原生 SDK。

### Agent 执行
`AgentCore` / `AgentCoreRuntime` 使用 LangGraph 的 `createReactAgent` 构建 Agent，挂载工具、系统提示词、记忆上下文和技能上下文。对话状态通过 Checkpoint 持久化到 PostgreSQL（或内存中）。通过 `AsyncEventQueue` 支持流式输出。

### 工具系统
三种工具注册方式：
1. **内置工具**：`get_time`、`echo_text`、`calculate`、`remember_fact`、`list_memory`、`list_skills`、`read_skill`
2. **本地工具**：通过 `registerLocalTool()` 注册，配合 Zod schema
3. **MCP 插件**：通过 `useMcpPlugin()` 加载外部 MCP 服务器的工具

当前 TS backend 额外提供宿主机文件工具（`read_file`、`write_file`、`list_files`、`execute_command`）以及 `coder` 子代理专用的 sandbox 工具（`sandbox_read_file`、`sandbox_write_file`、`sandbox_list_files`、`sandbox_execute_command`）。`coder` 子代理会在 `${AGENT_SANDBOX_ROOT:-.agent/sandboxes}` 下创建独立 workspace，并通过工具白名单只暴露 sandbox 工具。

### 技能系统
从 `skills/`、`.claude/skills/` 等目录加载 `SKILL.md` 文件。技能文件采用 Markdown + YAML frontmatter 格式。通过 `AGENT_ENABLED_SKILLS` 环境变量启用。

### 记忆系统
基于线程范围的"记忆事实"，持久化到 PostgreSQL（`agent_memory_facts` 表）或内存中。每次调用时作为提示词上下文注入。

### Provider 支持情况
- TypeScript：Qwen、GLM、OpenAI（均通过 OpenAI 兼容接口）
- Python：Qwen、GLM、OpenAI、Anthropic、Gemini（各自原生 SDK）

## 环境变量

`.env.example` 中的关键环境变量：
- `AGENT_PROVIDER` - 默认 LLM 提供商
- `AGENT_SYSTEM_PROMPT` - 系统提示词覆盖
- `QWEN_API_KEY`、`GLM_API_KEY`、`OPENAI_API_KEY` 等 - Provider API 密钥
- `AGENT_CHECKPOINTER_BACKEND` - `memory` 或 `postgres`
- `AGENT_ENABLED_SKILLS` - 逗号分隔的技能名称列表
- `AGENT_MCP_SERVERS_JSON` - MCP 服务器配置
- `AGENT_SANDBOX_ROOT` - `coder` 子代理 workspace sandbox 根目录
