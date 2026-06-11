# Intelligent Agent 架构与 Agent 开发学习指南

> **文档信息**
>
> | 字段 | 值 |
> |------|-----|
> | 创建日期 | 2026-06-09 |
> | 适用范围 | `agent_mono` Monorepo |
> | 核心包 | `@intelligent-agent/agent-core`（`core/agent-core-ts`） |
> | 目标读者 | 希望系统学习 Agent 开发的工程师 |

---

## 目录

1. [Monorepo 整体架构](#1-monorepo-整体架构)
2. [分层设计与职责边界](#2-分层设计与职责边界)
3. [Agent 核心包深度解析](#3-agent-核心包深度解析)
4. [一次 Agent 调用的完整链路](#4-一次-agent-调用的完整链路)
5. [核心 API 速查](#5-核心-api-速查)
6. [扩展机制：工具 / 技能 / MCP / 记忆](#6-扩展机制工具--技能--mcp--记忆)
7. [子代理（Multi-Agent）模式](#7-子代理multi-agent模式)
8. [持久化与基础设施](#8-持久化与基础设施)
9. [Gateway HTTP API 映射](#9-gateway-http-api-映射)
10. [环境变量配置](#10-环境变量配置)
11. [本地开发与调试](#11-本地开发与调试)
12. [Agent 开发学习路径](#12-agent-开发学习路径)
13. [延伸阅读](#13-延伸阅读)

---

## 1. Monorepo 整体架构

`intelligentAgent` 是一个**前后端分离的 Agent Monorepo**，核心思路是：

- **Core 层**：语言无关的 Agent 运行时能力（TS / Python 双实现）
- **Backend 层**：HTTP Gateway、鉴权、队列、附件、数据库适配
- **Frontend 层**：Web / Electron / CLI 多端消费
- **Packages 层**：共享类型、SDK、UI 组件

```
agent_mono/
├── core/
│   ├── agent-core-ts/          # TS Agent 核心（LangChain + LangGraph）
│   └── agent-core-python/      # Python Agent 核心（对等实现）
├── backend/
│   ├── agent-backend-ts/       # NestJS Gateway（:8080）
│   └── agent-backend-python/   # FastAPI Gateway（:8081）
├── frontend/
│   ├── web/                    # Next.js Web 控制台（:3000）
│   ├── desktop-electron/       # Electron 桌面端（默认）
│   ├── desktop/                # Tauri 桌面端（备选）
│   └── cli/                    # Ink CLI 终端客户端
├── packages/
│   ├── core-types/             # 前后端共享 TS 类型
│   ├── sdk-ts/                 # Agent API 客户端 SDK
│   └── ui/                     # 共享 React UI 组件
├── skills/                     # Agent 技能定义（SKILL.md）
└── infra/
    └── docker-compose.yml      # PostgreSQL 16 + Redis 7
```

### 1.1 架构总览图

```mermaid
flowchart TB
    subgraph Clients["客户端层"]
        WEB[Web :3000]
        ELEC[Electron]
        CLI[Ink CLI]
    end

    subgraph Gateway["Gateway 层"]
        NEST[NestJS Backend :8080]
        FAST[FastAPI Backend :8081]
    end

    subgraph Core["Agent Core 层"]
        AC_TS[agent-core-ts]
        AC_PY[agent-core-python]
    end

    subgraph LangGraph["编排引擎"]
        REACT[createReactAgent]
        CP[Checkpointer]
    end

    subgraph Infra["基础设施"]
        PG[(PostgreSQL)]
        RD[(Redis)]
        LLM[LLM Providers]
    end

    WEB --> NEST
    ELEC --> NEST
    CLI --> NEST
    WEB -.-> FAST

    NEST --> AC_TS
    FAST --> AC_PY

    AC_TS --> REACT
    AC_PY --> REACT
    REACT --> CP
    REACT --> LLM

    AC_TS --> PG
    NEST --> PG
    NEST --> RD
    CP --> PG
```

### 1.2 技术栈

| 层级 | 技术 |
|------|------|
| Agent 编排 | LangChain + LangGraph（ReAct Agent） |
| TS Core | `@langchain/core`、`@langchain/langgraph`、`@langchain/openai` |
| TS Backend | NestJS + Prisma + ioredis + BullMQ |
| Python Backend | FastAPI + SQLAlchemy + redis |
| 前端 | Next.js 15 + React + shadcn/ui + Tailwind |
| 持久化 | PostgreSQL（对话 checkpoint、记忆、运行记录） |
| 缓存/队列 | Redis + BullMQ |

---

## 2. 分层设计与职责边界

理解各层**做什么、不做什么**，是 Agent 开发的第一步。

```
┌─────────────────────────────────────────────────────────────┐
│  Frontend / CLI / Desktop                                   │
│  职责：UI 交互、SSE 消费、会话管理                             │
│  不做：直接调用 LangGraph、不持有 LLM API Key                  │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTP / SSE
┌──────────────────────────▼──────────────────────────────────┐
│  Backend Gateway（agent-backend-ts）                         │
│  职责：鉴权、DTO 校验、Redis 缓存、BullMQ 异步队列、            │
│        Prisma 运行记录、附件处理、ModelConfig 注入              │
│  不做：LangGraph 图组装（委托给 Core）                          │
└──────────────────────────┬──────────────────────────────────┘
                           │ AgentCore.invoke / invokeStream
┌──────────────────────────▼──────────────────────────────────┐
│  Agent Core（core/agent-core-ts）                            │
│  职责：Provider 路由、工具聚合、Prompt 拼装、                    │
│        LangGraph ReAct 执行、事件流、子代理编排                   │
│  不做：HTTP、JWT、业务数据库 CRUD（除 memory/checkpoint）       │
└──────────────────────────┬──────────────────────────────────┘
                           │ createReactAgent + tools + llm
┌──────────────────────────▼──────────────────────────────────┐
│  LangGraph + LLM Provider                                   │
│  职责：ReAct 循环（思考 → 调工具 → 观察 → 再思考）               │
└─────────────────────────────────────────────────────────────┘
```

### 2.1 Backend 如何初始化 AgentCore

Backend 在 `agent.runtime.ts` 中组装 Core，是理解「Core 与业务层如何解耦」的最佳入口：

```typescript
// backend/agent-backend-ts/src/runtime/agent.runtime.ts（简化）

const memoryStore = new PrismaMemoryStore(prisma);
const registry = registerBuiltinTools(new DefaultAgentToolRegistry());
const skillRegistry = new SkillRegistry();

// 从环境变量动态加载 MCP 插件
const mcpPlugins = await loadMcpPluginsFromEnv();
for (const plugin of mcpPlugins) registry.useMcpPlugin(plugin);

const checkpointerManager = await createCheckpointerManager({
  backend: "postgres",
  connectionString: process.env.POSTGRES_URL
});

const core = new AgentCore({
  toolRegistry: registry,
  memoryStore,
  skillRegistry,
  checkpointSaver: checkpointerManager.saver,
  mcpServices: { prisma },          // 注入业务依赖给 MCP 插件
  defaultProvider: "qwen",
  subagent: { maxConcurrency: 2, ... }
});
```

**设计要点：**

- Core 是**单例运行时**（`getAgentRuntime` 懒初始化）
- Memory 在 Backend 侧用 Prisma 适配，Core 只依赖 `MemoryStore` 接口
- MCP 插件可通过 `mcpServices` 拿到 `prisma` 等业务对象
- 激活的 ModelConfig 在 `invokeAgent` 时注入 `providerConfigs`

---

## 3. Agent 核心包深度解析

包名：`@intelligent-agent/agent-core`  
路径：`core/agent-core-ts/`

### 3.1 模块结构

| 文件 | 职责 |
|------|------|
| `agent.ts` | **主入口** `AgentCore` 类 |
| `types.ts` | 全部公共类型定义 |
| `provider-router.ts` | 多 LLM Provider 路由 |
| `tools.ts` | 工具注册表 + 内置工具 |
| `utils/tool-execution.ts` | 工具超时、串并行、事件钩子 |
| `skills.ts` | SKILL.md 发现与加载 |
| `memory.ts` | 线程级记忆（内存 / PostgreSQL） |
| `checkpointer.ts` | LangGraph Checkpoint 管理 |
| `events.ts` | `AgentRunEvent` 事件类型 |
| `event-stream.ts` | 异步事件流 `EventStream` |
| `subagent.ts` | 多 Agent 规划与并行执行 |
| `mcp.ts` | MCP 工具契约与静态插件 |
| `mcp-loader.ts` | 从环境变量动态 import 插件 |

### 3.2 AgentCore 内部执行流程

```mermaid
sequenceDiagram
    participant Caller as 调用方
    participant AC as AgentCore
    participant PR as ProviderRegistry
    participant TR as ToolRegistry
    participant SR as SkillRegistry
    participant MS as MemoryStore
    participant LG as LangGraph

    Caller->>AC: invoke({ prompt, threadId, ... })
    AC->>PR: createRoutedModel()
    PR-->>AC: ChatOpenAI + provider info
    AC->>TR: buildTools({ threadId, memoryStore, skillRegistry })
    TR-->>AC: StructuredTool[]
    AC->>MS: renderPromptContext(threadId)
    AC->>SR: renderPromptContext(enabledSkills)
    AC->>LG: createReactAgent({ llm, tools, prompt, checkpointer })
    AC->>LG: graph.invoke({ messages }, { thread_id })
    LG-->>AC: state.messages
    AC-->>Caller: { output, messages, checkpointId, ... }
```

### 3.3 Prompt 拼装规则

系统提示词由多段拼接（`\n\n` 分隔）：

1. **System Prompt**：`AgentCoreOptions.systemPrompt` 或 `AGENT_SYSTEM_PROMPT` 环境变量
2. **Memory Context**：`MemoryStore.renderPromptContext()` — 已知事实列表
3. **Skill Context**：`SkillRegistry.renderPromptContext()` — 可用技能摘要

Agent 可通过工具 `read_skill` 按需读取完整技能内容，避免 Prompt 过长。

---

## 4. 一次 Agent 调用的完整链路

以 Web 前端发起一次对话为例：

```
用户输入
  │
  ▼
POST /v1/agents/runs/stream  (NestJS AgentController)
  │
  ▼
AgentService.runStream()
  │  ├─ resolvePrompt / resolveThreadId
  │  ├─ Redis 缓存查询（可选命中）
  │  └─ invokeAgentStream() → agent.runtime.ts
  │
  ▼
AgentCore.invokeStream()
  │  ├─ push run_start 事件
  │  ├─ Provider 路由 → push model_selected
  │  ├─ 构建工具 → push tools_resolved
  │  ├─ LangGraph ReAct 循环
  │  │    ├─ LLM 决策
  │  │    ├─ tool_start / tool_end 事件
  │  │    └─ 循环直到产出最终回答
  │  └─ push run_end + 返回 AgentInvokeOutput
  │
  ▼
SSE 推送到前端 + Prisma 写入 agent_runs 记录
```

### 4.1 ReAct 循环（LangGraph 层）

LangGraph 的 `createReactAgent` 实现了经典 **ReAct** 模式：

```
Thought → Action（调用工具）→ Observation（工具结果）→ Thought → ... → Final Answer
```

本项目通过 `checkpointer` 将每轮 state 持久化，实现**多轮对话恢复**——同一 `threadId` 再次调用时会从上次 checkpoint 继续。

---

## 5. 核心 API 速查

### 5.1 AgentCore（主入口）

```typescript
import { AgentCore } from "@intelligent-agent/agent-core";

const agent = new AgentCore(options);

// ── 同步调用 ──
await agent.invoke(input: AgentInvokeInput): Promise<AgentInvokeOutput>

// ── 流式调用 ──
agent.invokeEventStream(input): AgentEventStream<AgentInvokeOutput>  // 可 for await
agent.invokeStream(input): AsyncGenerator<AgentRunEvent, AgentInvokeOutput>

// ── 子代理 ──
await agent.invokeSubagents(input: SubagentRunInput): Promise<SubagentRunOutput>
agent.invokeSubagentsEventStream(input): AgentEventStream<SubagentRunOutput>
agent.invokeSubagentsStream(input): AsyncGenerator<AgentRunEvent, SubagentRunOutput>

// ── 线程 / Checkpoint ──
await agent.listThreads(limit?): Promise<ThreadSummary[]>
await agent.getThread(threadId): Promise<ThreadDetail>

// ── 技能 ──
agent.listSkills(options?): Skill[]
agent.getSkill(name): Skill | null

// ── 记忆 ──
await agent.listMemoryFacts(threadId, limit?)
await agent.createMemoryFact(threadId, input)
await agent.deleteMemoryFact(threadId, factId)

// ── MCP ──
agent.listMcpPlugins(): McpPluginInfo[]
await agent.listMcpTools(input?): Promise<McpToolInfo[]>
await agent.invokeMcpTool(input): Promise<{ plugin, toolName, output }>
```

### 5.2 关键类型

```typescript
interface AgentInvokeInput {
  prompt: string;
  threadId: string;
  provider?: string;
  model?: string;
  metadata?: Record<string, unknown>;
  enabledSkills?: string[];
  runId?: string;
  messages?: BaseMessageLike[];       // 可选历史消息
  toolAllowlist?: string[];           // 工具白名单
  providerConfigs?: Record<string, ProviderRuntimeConfig>;
}

interface AgentInvokeOutput {
  output: string;                     // 最终 assistant 文本
  provider: string;
  messages: BaseMessage[];            // 完整消息历史
  toolCount: number;
  checkpointId?: string | null;
  threadId: string;
}

interface AgentCoreOptions {
  systemPrompt?: string;
  defaultProvider?: string;
  defaultModel?: string;
  providerConfigs?: Record<string, ProviderRuntimeConfig>;
  env?: Record<string, string | undefined>;
  subagent?: {
    maxConcurrency?: number;          // 默认 2
    taskTimeoutMs?: number;           // 默认 60000
    maxTasksPerRun?: number;          // 默认 8
    failurePolicy?: "continue_on_error" | "fail_fast";
    roleModelOverrides?: Partial<Record<SubagentRole, { provider?, model? }>>;
    roleToolAllowlist?: Partial<Record<SubagentRole, string[]>>;
  };
  toolRegistry?: AgentToolRegistry;
  checkpointSaver?: BaseCheckpointSaver;
  memoryStore?: MemoryStore;
  skillRegistry?: SkillRegistryLike;
  toolExecutionPolicy?: { mode?: "parallel" | "sequential"; timeoutMs?: number };
  mcpServices?: Record<string, unknown>;
}
```

### 5.3 工具注册 API

```typescript
import {
  DefaultAgentToolRegistry,
  registerBuiltinTools
} from "@intelligent-agent/agent-core";

const registry = registerBuiltinTools(new DefaultAgentToolRegistry());

// 本地工具（Zod schema）
registry.registerLocalTool({
  name: "search_code",
  description: "Search codebase",
  schema: z.object({ query: z.string() }),
  invoke: async (input, context) => { /* ... */ }
});

// LangChain StructuredTool
registry.registerStructuredTool(existingTool);

// MCP 插件
registry.useMcpPlugin(myMcpPlugin);
```

### 5.4 Provider 路由 API

```typescript
import { getProviderRegistry, createRoutedModel } from "@intelligent-agent/agent-core";

const registry = getProviderRegistry();
registry.registerProvider("custom", { apiKeyEnv: "...", ... });

const { chatModel, provider, model } = createRoutedModel({
  provider: "qwen",
  model: "qwen-plus"
});
```

### 5.5 Checkpoint API

```typescript
import {
  createCheckpointerManager,
  listThreads,
  getThread,
  getLatestCheckpointId
} from "@intelligent-agent/agent-core";

const { saver, kind, close } = await createCheckpointerManager({
  backend: "postgres",   // 或 "memory"
  connectionString: "postgresql://..."
});
```

### 5.6 流式事件类型

```typescript
type AgentRunEvent =
  | { type: "run_start"; runId; threadId; at }
  | { type: "model_selected"; provider; model; baseUrl; temperature; at }
  | { type: "tools_resolved"; toolNames; count; at }
  | { type: "tool_start"; toolName; input; threadId?; at }
  | { type: "tool_end"; toolName; input; output; durationMs; at }
  | { type: "tool_error"; toolName; input; error; durationMs; at }
  | { type: "plan_created"; runId; threadId; taskCount; at }       // 子代理
  | { type: "subagent_start"; ... }
  | { type: "subagent_end"; ... }
  | { type: "subagent_error"; ... }
  | { type: "run_end"; runId; threadId; provider; output; checkpointId; toolCount; at }
  | { type: "error"; runId; threadId; message; at }
```

---

## 6. 扩展机制：工具 / 技能 / MCP / 记忆

### 6.1 工具系统（三层 + 去重）

```
Structured Tools（LangChain 原生）
    ↓ 按 name 去重
Built-in Tools（7 个内置）
    ↓
Local Tools（registerLocalTool + Zod）
    ↓
MCP Plugin Tools（useMcpPlugin / 环境变量加载）
```

**内置工具：**

| 工具名 | 功能 |
|--------|------|
| `get_time` | 获取当前 UTC 时间 |
| `echo_text` | 回显文本（测试工具调用） |
| `calculate` | 简单算术表达式计算 |
| `remember_fact` | 写入线程记忆 |
| `list_memory` | 列出线程记忆 |
| `list_skills` | 列出可用技能 |
| `read_skill` | 读取技能完整内容 |

**工具执行策略：**

- `ToolExecutionPolicy.mode`：`parallel`（默认）或 `sequential`
- `ToolExecutionPolicy.timeoutMs`：全局超时
- 单个 Local Tool 可覆盖 `executionMode` 和 `timeoutMs`
- 所有工具调用自动 emit `tool_start` / `tool_end` / `tool_error` 事件

### 6.2 技能系统（Skills）

技能是 Markdown 文件（`SKILL.md`），带 YAML frontmatter：

```markdown
---
name: systematic-debugging
description: 系统性调试方法论
---

# Systematic Debugging
...（完整指令内容）...
```

**扫描目录（优先级从低到高，同名后者覆盖）：**

- 项目内：`skills/`、`.agents/skills/`、`.claude/skills/`、`.codex/skills/`
- 用户主目录：`~/.codex/skills`、`~/.agents/skills`、`~/.claude/skills`
- 环境变量：`AGENT_SKILLS_DIR`（多路径，`:` 分隔）

**启用控制：** `AGENT_ENABLED_SKILLS=skill-a,skill-b`

### 6.3 MCP 插件

**加载方式：**

```bash
AGENT_MCP_PLUGIN_MODULES=./path/to/plugin.mjs,package-name/plugin
```

**插件接口：**

```typescript
interface McpToolPlugin {
  name: string;
  loadTools: (context?: {
    invocationContext: { threadId?, runId?, metadata? };
    services?: Record<string, unknown>;  // 如 prisma
  }) => Promise<StructuredToolInterface[]>;
}
```

模块需导出 `default` 或 `plugin`。

**辅助 API：**

```typescript
import { createMcpTool, StaticMcpToolPlugin } from "@intelligent-agent/agent-core";

// 快速创建静态 MCP 插件
new StaticMcpToolPlugin("my-plugin", [descriptor1, descriptor2]);
```

### 6.4 记忆系统（Memory）

线程级「事实记忆」，每次调用自动注入 Prompt：

```
Known memory facts:
- [context] 用户偏好 TypeScript
- [project] 当前项目是 agent_mono
```

**实现：**

| 类 | 场景 |
|----|------|
| `InMemoryMemoryStore` | 开发/测试 |
| `PostgresMemoryStore` | 独立 PostgreSQL 表 `agent_memory_facts` |
| `PrismaMemoryStore`（Backend） | 通过 Prisma 适配，表结构同上 |

Agent 可通过 `remember_fact` / `list_memory` 工具在对话中读写记忆。

---

## 7. 子代理（Multi-Agent）模式

`invokeSubagents` 实现了轻量多 Agent 协作：

```mermaid
flowchart LR
    INPUT[用户目标] --> PLANNER[Planner 规划]
    PLANNER --> |JSON 任务数组| WORKERS[并行 Worker]
    WORKERS --> R1[Researcher]
    WORKERS --> R2[Coder]
    WORKERS --> R3[...]
    R1 --> SUP[Supervisor 汇总]
    R2 --> SUP
    R3 --> SUP
    SUP --> OUTPUT[summary 输出]
```

**角色：**

| 角色 | 职责 | 默认工具集（Backend 配置） |
|------|------|---------------------------|
| `planner` | 拆解任务为 JSON 数组 | list_skills, read_skill, echo_text, get_time |
| `researcher` | 研究事实、约束、风险 | list_skills, read_skill, list_memory, get_time, echo_text |
| `coder` | 实现方案与代码结构 | list_skills, read_skill, remember_fact, list_memory, calculate, echo_text, get_time |

**配置项：**

- `maxConcurrency`：并行度（默认 2，上限 8）
- `taskTimeoutMs`：单任务超时（默认 60s）
- `maxTasksPerRun`：单次最多任务数（默认 8）
- `failurePolicy`：`continue_on_error`（默认）或 `fail_fast`
- `roleModelOverrides`：按角色指定不同 Provider/Model
- `roleToolAllowlist`：按角色限制工具

**用法：**

```typescript
const result = await agent.invokeSubagents({
  threadId: "main-thread",
  prompt: "帮我实现一个 Redis 缓存层",
  // 或直接指定 tasks:
  // tasks: [{ role: "researcher", prompt: "..." }, { role: "coder", prompt: "..." }]
});

console.log(result.summary);       // Supervisor 汇总
console.log(result.results);       // 各子任务详情
console.log(result.partial);       // 是否有失败
```

---

## 8. 持久化与基础设施

### 8.1 PostgreSQL 用途

| 数据 | 存储方式 | 说明 |
|------|----------|------|
| 对话 Checkpoint | LangGraph `PostgresSaver` | 多轮对话 state 恢复 |
| 记忆事实 | `agent_memory_facts` 表 | 线程级长期记忆 |
| 运行记录 | `agent_runs` 表（Prisma） | Backend 业务记录 |
| 模型配置 | `model_configs` 表 | 激活的 Provider/Model/API Key |
| 附件 | `attachments` + `attachment_chunks` | 文件上传与全文检索 |

### 8.2 Redis 用途

- 健康检查
- 运行结果缓存（provider + model + thread + message 组合键）
- BullMQ 异步任务队列（Agent Run Jobs、附件处理）

### 8.3 Provider 支持

| Provider | TS Core | Python Core | 接口方式 |
|----------|---------|---------------|----------|
| qwen | ✅ | ✅ | OpenAI 兼容 |
| glm | ✅ | ✅ | OpenAI 兼容 |
| openai | ✅ | ✅ | OpenAI 兼容 |
| deepseek | ✅ | — | OpenAI 兼容 |
| anthropic | — | ✅ | 原生 SDK |
| gemini | — | ✅ | 原生 SDK |

TS 侧统一通过 `ChatOpenAI` + 自定义 `baseURL` 对接 OpenAI 兼容 API。

---

## 9. Gateway HTTP API 映射

Core API 与 HTTP 接口的对应关系：

| HTTP 接口 | Core 方法 | 说明 |
|-----------|-----------|------|
| `POST /v1/agents/runs` | `invoke()` | 同步执行 |
| `POST /v1/agents/runs/stream` | `invokeStream()` | SSE 流式（仅 TS） |
| `POST /v1/agents/runs/jobs` | `invoke()` + BullMQ | 异步任务（仅 TS） |
| `GET /v1/threads` | `listThreads()` | 线程列表 |
| `GET /v1/threads/:id` | `getThread()` | 线程详情 |
| `GET /v1/threads/:id/checkpoints` | `getThread()` | Checkpoint 历史 |
| `GET /v1/threads/:id/memory` | `listMemoryFacts()` | 记忆列表 |
| `POST /v1/threads/:id/memory/facts` | `createMemoryFact()` | 创建记忆 |
| `DELETE /v1/threads/:id/memory/facts/:factId` | `deleteMemoryFact()` | 删除记忆 |
| `GET /v1/skills` | `listSkills()` | 技能列表 |
| `GET /v1/skills/:name` | `getSkill()` | 技能详情 |
| `GET /v1/mcp/plugins` | `listMcpPlugins()` | MCP 插件 |
| `GET /v1/mcp/tools` | `listMcpTools()` | MCP 工具 |
| `POST /v1/mcp/tools/:name/invoke` | `invokeMcpTool()` | 调用 MCP 工具 |

---

## 10. 环境变量配置

### 10.1 LLM Provider

```bash
AGENT_PROVIDER=qwen                    # 默认 Provider
AGENT_SYSTEM_PROMPT=...                # 系统提示词覆盖
AGENT_TEMPERATURE=0.2                  # 全局温度

# Qwen
QWEN_API_KEY=sk-xxx
QWEN_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
QWEN_MODEL=qwen-plus

# GLM
GLM_API_KEY=xxx
GLM_MODEL=glm-4.5

# OpenAI
OPENAI_API_KEY=sk-xxx
OPENAI_MODEL=gpt-4.1-mini

# DeepSeek
DEEPSEEK_API_KEY=xxx
DEEPSEEK_MODEL=deepseek-chat
```

### 10.2 Agent 运行时

```bash
AGENT_CHECKPOINTER_BACKEND=postgres    # postgres | memory
AGENT_ENABLED_SKILLS=skill-a,skill-b   # 启用的技能
AGENT_SKILLS_DIR=./custom-skills       # 额外技能目录
AGENT_MCP_PLUGIN_MODULES=./plugin.mjs   # MCP 插件模块

# 子代理
AGENT_SUBAGENT_MAX_CONCURRENCY=2
AGENT_SUBAGENT_TASK_TIMEOUT_MS=60000
AGENT_SUBAGENT_MAX_TASKS=8
AGENT_SUBAGENT_FAILURE_POLICY=continue_on_error
AGENT_SUBAGENT_PLANNER_PROVIDER=qwen
AGENT_SUBAGENT_CODER_MODEL=qwen-plus
```

### 10.3 基础设施

```bash
POSTGRES_URL=postgresql://intelligent:intelligent@127.0.0.1:5432/intelligent_agent
REDIS_URL=redis://127.0.0.1:6379
NEST_PORT=8080
```

---

## 11. 本地开发与调试

### 11.1 一键初始化

```bash
cp .env.example .env
make setup          # Docker PG+Redis + pnpm install + prisma push
```

### 11.2 启动服务

```bash
make dev-api-ts     # NestJS :8080
make dev-web        # Next.js :3000
make dev-cli        # Ink CLI
make dev-desktop    # Electron

# 或一键启动 backend + frontend
make dev-web-full
```

### 11.3 运行测试

```bash
pnpm --filter @intelligent-agent/agent-core test   # Core 单包测试
make test                                           # 全部测试
```

### 11.4 最小 Core 调用示例

不依赖 Backend，直接在 Node 中调用 Core：

```typescript
import { AgentCore, InMemoryMemoryStore } from "@intelligent-agent/agent-core";

const agent = new AgentCore({
  memoryStore: new InMemoryMemoryStore(),
  defaultProvider: "qwen",
  env: process.env
});

const result = await agent.invoke({
  prompt: "现在几点？用工具回答。",
  threadId: "demo-001"
});

console.log(result.output);
```

### 11.5 流式调试

```typescript
for await (const event of agent.invokeStream({
  prompt: "计算 (12+3)*4",
  threadId: "demo-002"
})) {
  console.log(`[${event.type}]`, event);
}
```

---

## 12. Agent 开发学习路径

建议按以下顺序循序渐进：

### 阶段 1：理解 ReAct 与 LangGraph 基础

**目标：** 理解 Agent 不是「一次 LLM 调用」，而是「LLM + 工具循环」。

- 阅读 LangGraph 官方文档：[ReAct Agent](https://langchain-ai.github.io/langgraph/)
- 对照本项目 `agent.ts` 中 `createReactAgent` 的用法
- 运行内置工具测试：`pnpm --filter @intelligent-agent/agent-core test`

**关键概念：**

- `thread_id`：对话线程标识，关联 checkpoint
- `checkpoint`：每轮 state 快照，支持多轮恢复
- `StructuredTool`：LLM 可见的工具定义（name + description + schema）

### 阶段 2：工具开发

**目标：** 学会扩展 Agent 能力。

1. 先用内置工具（`get_time`、`calculate`）理解工具调用流程
2. 编写 Local Tool：

```typescript
registry.registerLocalTool({
  name: "get_weather",
  description: "Get weather for a city",
  schema: z.object({ city: z.string() }),
  invoke: async ({ city }) => {
    // 调用外部 API
    return { city, temp: 25, unit: "C" };
  }
});
```

3. 理解 `toolAllowlist` 如何限制 Agent 可用工具
4. 理解 `ToolExecutionPolicy` 的串并行与超时

### 阶段 3：Prompt 工程与技能

**目标：** 通过 Skills 和 Memory 增强 Agent 行为。

1. 在 `skills/` 下创建 `SKILL.md`，设置 `AGENT_ENABLED_SKILLS`
2. 观察 Skill Context 如何注入 Prompt
3. 使用 `remember_fact` 工具测试记忆持久化
4. 调整 `AGENT_SYSTEM_PROMPT` 观察行为变化

### 阶段 4：MCP 插件开发

**目标：** 接入外部工具生态。

1. 实现 `McpToolPlugin` 接口
2. 通过 `AGENT_MCP_PLUGIN_MODULES` 加载
3. 使用 `GET /v1/mcp/tools` 和 `POST /v1/mcp/tools/:name/invoke` 测试

### 阶段 5：流式事件与前端集成

**目标：** 构建可观测的 Agent UI。

1. 消费 `invokeStream` 事件流
2. 理解 SSE 接口 `POST /v1/agents/runs/stream`
3. 在前端展示 `tool_start` / `tool_end` 过程
4. 参考 `packages/ui/src/components/agent-workspace.tsx`

### 阶段 6：多 Agent 与子代理

**目标：** 处理复杂任务的分解与协作。

1. 调用 `invokeSubagents` 观察 planner → worker → supervisor 流程
2. 配置 `roleModelOverrides` 为不同角色使用不同模型
3. 配置 `roleToolAllowlist` 限制各角色工具权限
4. 通过 `invokeSubagentsStream` 观察子代理事件

### 阶段 7：生产化

**目标：** 理解 Backend 层的生产 Concerns。

1. Checkpoint 持久化（PostgreSQL vs Memory）
2. Redis 缓存策略
3. BullMQ 异步队列
4. JWT 鉴权与 ModelConfig 管理
5. 附件上传与全文检索

---

## 13. 延伸阅读

| 文档 | 路径 | 内容 |
|------|------|------|
| Agent 能力清单 | `AGENT_CAPABILITIES.zh-CN.md` | 全量能力列表与 TS/Python 对齐 |
| LangGraph API 说明 | `backend/agent-backend-ts/LANGGRAPH_APIS.zh-CN.md` | LangGraph API 在本项目中的落点 |
| Core README | `core/agent-core-ts/README.zh-CN.md` | Core 包简介与 MCP 注入 |
| 项目 README | `README.md` | Monorepo 结构与启动命令 |
| CLAUDE.md | `CLAUDE.md` | 开发命令与架构速查 |

---

## 附录 A：Core 包文件索引

```
core/agent-core-ts/
├── ts/
│   ├── index.ts              # 公共导出入口
│   ├── agent.ts              # AgentCore 主类
│   ├── types.ts              # 类型定义
│   ├── provider-router.ts    # LLM Provider 路由
│   ├── tools.ts              # 工具注册表 + 内置工具
│   ├── skills.ts             # SkillRegistry
│   ├── memory.ts             # MemoryStore 实现
│   ├── checkpointer.ts       # Checkpoint 管理
│   ├── events.ts             # AgentRunEvent 类型
│   ├── event-stream.ts       # EventStream 异步迭代
│   ├── subagent.ts           # 子代理编排
│   ├── mcp.ts                # MCP 工具契约
│   ├── mcp-loader.ts         # MCP 动态加载
│   └── utils/
│       ├── tool-execution.ts # 工具执行策略
│       └── value-utils.ts    # 值序列化
└── test/
    ├── agent-core.test.ts
    ├── tools.test.ts
    ├── subagent.test.ts
    └── event-stream.test.ts
```

## 附录 B：设计原则总结

1. **Core 与 Gateway 分离**：Agent 逻辑不耦合 HTTP/鉴权/队列，Core 可独立测试和复用
2. **接口驱动扩展**：`MemoryStore`、`AgentToolRegistry`、`SkillRegistryLike`、`McpToolPlugin` 均可替换
3. **LangGraph 薄封装**：不重复造 Agent 轮子，专注 Provider 路由、工具聚合、Prompt 注入、事件流
4. **按名去重工具**：Structured → Built-in → Local → MCP，后者覆盖前者
5. **观测优先**：完整生命周期事件（`AgentRunEvent`），适合 SSE/WebSocket 推送
6. **渐进式多 Agent**：Subagent 提供 planner → worker → supervisor 轻量模式，无需引入重量级 Multi-Agent 框架
7. **TS/Python 双实现**：Core 层语言无关，Gateway 层各自适配，共享 HTTP 接口契约（`core-types`）

---

*本文档基于 2026-06-09 代码库状态整理，如有架构变更请同步更新。*
