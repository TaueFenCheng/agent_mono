# Checkpointer 与 CheckpointerManager 详解

> **文档信息**
>
> | 字段 | 值 |
> |------|-----|
> | 创建日期 | 2026-06-09 |
> | 目标读者 | 刚入门 Agent 开发的工程师 |
> | 源码位置 | `core/agent-core-ts/ts/checkpointer.ts` |
> | 相关文档 | `backend/agent-backend-ts/STORAGE_RESPONSIBILITIES.zh-CN.md` |

---

## 目录

1. [先建立直觉：Agent 为什么需要 Checkpointer？](#1-先建立直觉agent-为什么需要-checkpointer)
2. [核心概念速查](#2-核心概念速查)
3. [CheckpointerManager 是什么？](#3-checkpointermanager-是什么)
4. [源码 API 逐函数讲解](#4-源码-api-逐函数讲解)
5. [LangGraph 底层 API 与本项目的封装关系](#5-langgraph-底层-api-与本项目的封装关系)
6. [在项目中的完整使用链路](#6-在项目中的完整使用链路)
7. [Checkpointer vs MemoryStore：最容易混淆的点](#7-checkpointer-vs-memorystore最容易混淆的点)
8. [HTTP API 如何暴露 Checkpoint 能力](#8-http-api-如何暴露-checkpoint-能力)
9. [配置与环境变量](#9-配置与环境变量)
10. [动手实验：验证多轮对话](#10-动手实验验证多轮对话)
11. [常见问题与踩坑指南](#11-常见问题与踩坑指南)
12. [进阶话题](#12-进阶话题)

---

## 1. 先建立直觉：Agent 为什么需要 Checkpointer？

### 1.1 没有 Checkpointer 时会发生什么？

想象你和一个 Agent 聊天：

```
用户：我叫小明，帮我写一个排序函数
Agent：好的，小明！这是快速排序的实现...

用户：刚才那个函数，帮我加上单元测试
Agent：请问您指的是哪个函数？（❌ 它忘了上一轮说了什么）
```

普通 LLM API 调用是**无状态的**：每次请求都是独立的，模型不会自动记住上一轮对话。

### 1.2 两种常见的「记忆」方案

| 方案 | 做法 | 优点 | 缺点 |
|------|------|------|------|
| **手动传历史** | 每次请求把完整 messages 数组传给 LLM | 简单 | 需要自己管理历史、Token 会膨胀 |
| **Checkpointer** | LangGraph 自动保存/恢复图运行状态 | 框架托管、支持中断恢复、可回溯 | 需要理解 thread_id 等概念 |

本项目采用 **LangGraph Checkpointer**：每次 Agent 执行完成后，框架自动把当前状态（messages、中间变量等）存成一条 **Checkpoint**；下次用同一个 `thread_id` 调用时，从最新 Checkpoint 恢复，继续对话。

### 1.3 一个生活类比

把 Checkpointer 想象成**游戏存档**：

- **thread_id** = 存档槽位（「小明的主线任务」）
- **checkpoint** = 某次存档快照（每打完一关自动存一次）
- **checkpoint_id** = 存档编号（可以回溯到某个历史存档）
- **parent_checkpoint_id** = 上一个存档编号（形成存档链）

```
thread_id: "conv-001"
  ├── checkpoint-1  (用户: "你好")
  │     └── messages: [Human: "你好", AI: "你好！有什么可以帮你？"]
  ├── checkpoint-2  (用户: "写个排序函数")
  │     └── messages: [...上一轮..., Human: "写个排序函数", AI: "这是快速排序..."]
  └── checkpoint-3  (用户: "加单元测试")  ← 最新，从这里恢复
        └── messages: [...完整历史..., Human: "加单元测试", AI: "好的，为刚才的函数加上测试..."]
```

---

## 2. 核心概念速查

| 概念 | 含义 | 在本项目中的体现 |
|------|------|------------------|
| **Checkpoint** | LangGraph 图执行到某一步时的**状态快照** | 包含 `messages`、channel values、metadata |
| **thread_id** | 对话线程标识，Checkpointer 按它分组存档 | `AgentInvokeInput.threadId` |
| **run_id** | 单次执行的标识，用于区分同线程内的不同 run | `AgentInvokeInput.runId` |
| **BaseCheckpointSaver** | LangGraph 定义的持久化抽象接口 | `MemorySaver` / `PostgresSaver` 都实现它 |
| **CheckpointerManager** | 本项目对 Saver 的**工厂 + 生命周期封装** | `createCheckpointerManager()` 的返回值 |
| **MemoryStore** | 另一套存储：结构化「记忆事实」 | 与 Checkpointer **不是一回事**（见第 7 节） |

---

## 3. CheckpointerManager 是什么？

### 3.1 它解决什么问题？

LangGraph 只要求你传入一个 `BaseCheckpointSaver`，但不负责：

- 根据环境选择用内存还是 PostgreSQL
- 初始化数据库表（`PostgresSaver.setup()`）
- 优雅关闭连接（`PostgresSaver.end()`）
- 把 checkpoint 数据转成业务友好的 Thread 列表

**CheckpointerManager** 就是本项目在 Core 层做的这一层封装。

### 3.2 接口定义

```typescript
// core/agent-core-ts/ts/checkpointer.ts

export interface CheckpointerManager {
  kind: "memory" | "postgres";   // 当前使用的后端类型
  saver: BaseCheckpointSaver;    // 交给 LangGraph 使用的 saver 实例
  close(): Promise<void>;         // 关闭资源（Postgres 连接等）
}
```

三个字段各司其职：

| 字段 | 用途 |
|------|------|
| `kind` | 运行时诊断、Backend 暴露当前模式（`getCheckpointerKind()`） |
| `saver` | 注入 `AgentCore({ checkpointSaver: manager.saver })` |
| `close` | 进程退出时释放 Postgres 连接池 |

### 3.3 创建流程

```mermaid
flowchart TD
    START[createCheckpointerManager] --> SELECT{选择 backend}
    SELECT -->|postgres| PG[PostgresSaver.fromConnString]
    SELECT -->|memory| MEM[new MemorySaver]
    PG --> SETUP[await saver.setup]
    SETUP --> RETURN_PG["返回 { kind: 'postgres', saver, close }"]
    MEM --> RETURN_MEM["返回 { kind: 'memory', saver, close: noop }"]
```

**backend 选择优先级：**

1. 显式传入 `input.backend`
2. 环境变量 `AGENT_CHECKPOINTER_BACKEND`
3. 若提供了 `connectionString` 则默认 `postgres`，否则 `memory`

---

## 4. 源码 API 逐函数讲解

所有 API 位于 `core/agent-core-ts/ts/checkpointer.ts`，并通过 `index.ts` 对外导出。

### 4.1 `createCheckpointerManager(input)`

**作用：** 工厂函数，创建并初始化 CheckpointerManager。

```typescript
const manager = await createCheckpointerManager({
  backend: "postgres",                              // 可选："memory" | "postgres"
  connectionString: "postgresql://user:pass@host/db" // postgres 模式必填
});

// 使用
const agent = new AgentCore({
  checkpointSaver: manager.saver
});

// 进程退出时
await manager.close();
```

**Postgres 模式内部做了什么：**

```typescript
const saver = PostgresSaver.fromConnString(input.connectionString);
await saver.setup();  // 自动创建 LangGraph 需要的 checkpoint 表
```

**Memory 模式：**

```typescript
const saver = new MemorySaver();  // 纯内存，进程重启后数据丢失
```

---

### 4.2 `listThreads(checkpointer, limit?)`

**作用：** 列出所有对话线程的摘要信息。

```typescript
const threads = await listThreads(manager.saver, 20);
// 返回 ThreadSummary[]
```

**返回结构：**

```typescript
interface ThreadSummary {
  thread_id: string;
  created_at?: string | null;           // 最早 checkpoint 时间
  updated_at?: string | null;           // 最新 checkpoint 时间
  latest_checkpoint_id?: string | null; // 最新 checkpoint 编号
  title?: string | null;                // 来自 channel_values.title（若有）
}
```

**实现原理：** 遍历 `checkpointer.list()` 的全局 checkpoint，按 `thread_id` 聚合，取最早/最晚时间戳。

**典型用途：** 对话列表页、管理后台展示所有会话。

---

### 4.3 `getThreadCheckpoints(checkpointer, threadId)`

**作用：** 获取某个线程的**全部 checkpoint 链**（按时间升序）。

```typescript
const checkpoints = await getThreadCheckpoints(manager.saver, "thread-001");
// 返回 ThreadCheckpoint[]
```

**返回结构：**

```typescript
interface ThreadCheckpoint {
  checkpoint_id?: string | null;
  parent_checkpoint_id?: string | null;  // 形成链表，可回溯
  ts?: string | null;                      // 时间戳
  metadata?: Record<string, unknown>;
  values: Record<string, unknown>;         // 核心：channel_values，含 messages
  pending_writes: Array<Record<string, unknown>>;
}
```

**特别处理：** 若 `values.messages` 是 LangChain 消息对象，会调用 `serializeMessage()` 转成 JSON 友好格式：

```typescript
// 序列化后
{ role: "user", content: "你好", type: "HumanMessage" }
{ role: "assistant", content: "你好！", type: "AIMessage" }
{ role: "tool", content: "...", type: "ToolMessage" }
```

**典型用途：** 调试、审计、前端展示完整对话历史。

---

### 4.4 `getLatestCheckpointId(checkpointer, threadId)`

**作用：** 获取某线程最新 checkpoint 的 ID（轻量查询）。

```typescript
const id = await getLatestCheckpointId(manager.saver, "thread-001");
// "00000000-0000-0000-0000-000000000001" 或 null
```

**在项目中的用途：** 每次 `AgentCore.invoke()` 完成后，把 `checkpointId` 写入响应和 `agent_runs` 业务表，便于关联「这次 run 对应哪个存档点」。

---

### 4.5 `getThread(checkpointer, threadId)`

**作用：** `getThreadCheckpoints` 的便捷封装。

```typescript
const detail = await getThread(manager.saver, "thread-001");
// { thread_id: "thread-001", checkpoints: [...] }
```

---

### 4.6 `serializeMessage(message)`

**作用：** 将 LangChain `BaseMessage` 转为可 JSON 序列化的 plain object。

```typescript
serializeMessage(new HumanMessage("你好"));
// { role: "user", content: "你好", type: "HumanMessage" }
```

**为什么需要它：** Checkpoint 里的 messages 是 LangChain 类实例，不能直接 `JSON.stringify` 给前端；导出 HTTP API 前必须序列化。

---

## 5. LangGraph 底层 API 与本项目的封装关系

本项目**不直接对外暴露** LangGraph 底层 API，但在内部依赖它们。理解这层关系有助于读源码和查官方文档。

```
┌─────────────────────────────────────────────────────────────┐
│  本项目封装（checkpointer.ts）                                │
│  createCheckpointerManager / listThreads / getThread / ...   │
└──────────────────────────┬──────────────────────────────────┘
                           │ 内部调用
┌──────────────────────────▼──────────────────────────────────┐
│  LangGraph BaseCheckpointSaver                               │
│  .list(config, options)   ← 遍历 checkpoint                  │
│  .get(config)             ← 获取单个 checkpoint（本项目未直接用）│
│  .put(...)                ← 写入 checkpoint（LangGraph 内部调用）│
└──────────────────────────┬──────────────────────────────────┘
                           │ 实现类
          ┌────────────────┴────────────────┐
          ▼                                 ▼
   MemorySaver                      PostgresSaver
   （进程内存）                      （PostgreSQL 表）
```

### 5.1 `thread_id` 是如何生效的？

LangGraph 在执行图时通过 `RunnableConfig` 传递配置：

```typescript
// core/agent-core-ts/ts/agent.ts

const state = await graph.invoke(
  { messages: [...(input.messages ?? []), new HumanMessage(input.prompt)] },
  {
    configurable: {
      thread_id: input.threadId,           // ← 存档槽位
      run_id: input.runId ?? input.threadId // ← 本次执行标识
    }
  }
);
```

**关键规则：**

- 相同 `thread_id` → LangGraph 从**最新 checkpoint** 恢复 state，再追加新消息
- 不同 `thread_id` → 全新对话，互不影响
- `createReactAgent` 创建图时传入 `checkpointer`：

```typescript
const graph = createReactAgent({
  llm: routed.chatModel,
  tools,
  prompt: promptSections.join("\n\n"),
  checkpointer: this.options.checkpointSaver,  // ← 这里注入
  name: "intelligent-agent-core"
});
```

若 `checkpointSaver` 为 `undefined`，则**每次调用都是全新会话**，无法多轮恢复。

---

## 6. 在项目中的完整使用链路

### 6.1 初始化（Backend Runtime）

```typescript
// backend/agent-backend-ts/src/runtime/agent.runtime.ts

async function createCore(prisma: PrismaClient): Promise<AgentRuntime> {
  // 1. 尝试创建 Postgres Checkpointer
  let checkpointerManager: CheckpointerManager;
  try {
    checkpointerManager = await createCheckpointerManager({
      backend: process.env.AGENT_CHECKPOINTER_BACKEND ?? "postgres",
      connectionString: process.env.POSTGRES_URL ?? `postgresql://...`
    });
  } catch (error) {
    // 2. Postgres 失败则降级到 Memory（开发友好）
    console.warn(`[agent-runtime] postgres checkpointer init failed, fallback to memory: ${reason}`);
    checkpointerManager = await createCheckpointerManager({ backend: "memory" });
  }

  // 3. 注入 AgentCore
  return {
    core: new AgentCore({
      checkpointSaver: checkpointerManager.saver,  // ← 核心注入点
      memoryStore,
      toolRegistry: registry,
      // ...
    }),
    checkpointerKind: checkpointerManager.kind,
    close: async () => {
      await checkpointerManager.close();
    }
  };
}
```

**设计要点：**

- Runtime 是**单例**（`getAgentRuntime` 懒初始化），整个进程共享一个 Checkpointer
- Postgres 初始化失败**不会阻断服务**，自动降级 Memory
- 关闭时调用 `checkpointerManager.close()` 释放连接

### 6.2 执行时（AgentCore.invoke）

```mermaid
sequenceDiagram
    participant Client as HTTP Client
    participant Backend as agent.runtime.ts
    participant AC as AgentCore
    participant LG as LangGraph
    participant CP as Checkpointer (Saver)

    Client->>Backend: POST /v1/agents/runs { threadId, messages }
    Backend->>AC: invoke({ prompt, threadId, runId })
    AC->>LG: createReactAgent({ checkpointer: saver })
    AC->>LG: graph.invoke(messages, { thread_id })
    LG->>CP: 读取 thread_id 最新 checkpoint（若有）
    LG->>LG: ReAct 循环（LLM + Tools）
    LG->>CP: 写入新 checkpoint
    LG-->>AC: state.messages
    AC->>CP: getLatestCheckpointId(threadId)
    AC-->>Backend: { output, checkpointId, ... }
    Backend->>Backend: 写入 agent_runs 表（含 checkpointId）
    Backend-->>Client: AgentRunResponse
```

### 6.3 查询时（AgentCore.listThreads / getThread）

```typescript
// AgentCore 封装
async listThreads(limit = 20) {
  if (!this.options.checkpointSaver) return [];
  return listThreads(this.options.checkpointSaver, limit);
}

async getThread(threadId: string) {
  if (!this.options.checkpointSaver) {
    return { thread_id: threadId, checkpoints: [] };
  }
  return getThread(this.options.checkpointSaver, threadId);
}
```

Backend 再透传：

```typescript
// agent.runtime.ts
export async function listRuntimeThreads(prisma, limit) {
  const runtime = await getAgentRuntime(prisma);
  return runtime.core.listThreads(limit);
}

// agent.service.ts
async listThreads(limit = 20) {
  return { thread_list: await listRuntimeThreads(this.db.getPrisma(), limit) };
}
```

### 6.4 三层调用关系总览

```
HTTP 层          Backend 层              Core 层                LangGraph 层
─────────        ──────────              ───────                ────────────
GET /v1/threads  listRuntimeThreads  →  listThreads()       →  saver.list()
GET /v1/threads/:id  getRuntimeThread  →  getThread()         →  getThreadCheckpoints()
POST /v1/agents/runs  invokeAgent      →  invoke()            →  graph.invoke + saver.put
                                      →  getLatestCheckpointId()
```

---

## 7. Checkpointer vs MemoryStore：最容易混淆的点

这是新手**最高频的误区**，务必分清。

### 7.1 一句话区分

| | Checkpointer | MemoryStore |
|---|-------------|-------------|
| **存什么** | LangGraph 图运行的**完整状态快照**（messages 链、channel values） | 人工提炼的**结构化记忆事实** |
| **谁写入** | LangGraph 框架自动写入 | Agent 通过 `remember_fact` 工具或 API 手动写入 |
| **谁读取** | LangGraph 自动恢复；也可通过 API 查历史 | 每次调用前注入 Prompt：`Known memory facts: ...` |
| **典型内容** | 完整对话 messages、工具调用记录 | 「用户偏好 TypeScript」「项目使用 pnpm」 |
| **表/存储** | LangGraph 管理的 checkpoint 表（PostgresSaver） | `agent_memory_facts` 表（PrismaMemoryStore） |
| **类比** | 游戏**完整存档** | 游戏里的**备忘录/任务日志** |

### 7.2 它们如何协作

一次 Agent 调用中，两者**同时生效**但职责不同：

```
AgentCore.invoke()
  │
  ├─ Checkpointer：恢复 thread_id 的历史 messages（自动）
  │
  ├─ MemoryStore.renderPromptContext()：注入记忆事实到 Prompt（自动）
  │
  └─ LangGraph ReAct 循环
       ├─ LLM 可能调用 remember_fact → 写入 MemoryStore
       └─ 执行结束 → Checkpointer 保存新 checkpoint
```

### 7.3 为什么都落 PostgreSQL 却是两套表？

```
PostgreSQL
├── LangGraph checkpoint 表     ← PostgresSaver 自动管理，Prisma 不管
└── agent_memory_facts 表       ← Prisma schema 管理，MemoryStore 写入
```

即使同一个数据库，**接口、表结构、读写时机完全不同**，不能混用。

更完整的存储职责说明见：`backend/agent-backend-ts/STORAGE_RESPONSIBILITIES.zh-CN.md`。

---

## 8. HTTP API 如何暴露 Checkpoint 能力

| HTTP 接口 | Core 方法 | 返回内容 |
|-----------|-----------|----------|
| `GET /v1/threads?limit=20` | `listThreads()` | 线程摘要列表 |
| `GET /v1/threads/:threadId` | `getThread()` | 线程详情 + 全部 checkpoints |
| `GET /v1/threads/:threadId/checkpoints` | `getThread()` | 同上（别名路由） |
| `POST /v1/agents/runs` | `invoke()` | 响应含 `checkpointId` |
| `POST /v1/agents/runs/stream` | `invokeStream()` | `run_end` 事件含 `checkpointId` |

**响应示例（线程详情）：**

```json
{
  "thread_id": "thread-abc123",
  "checkpoints": [
    {
      "checkpoint_id": "00000000-0000-0000-0000-000000000001",
      "parent_checkpoint_id": null,
      "ts": "2026-06-09T10:00:00.000Z",
      "metadata": {},
      "values": {
        "messages": [
          { "role": "user", "content": "你好", "type": "HumanMessage" },
          { "role": "assistant", "content": "你好！", "type": "AIMessage" }
        ]
      },
      "pending_writes": []
    }
  ]
}
```

**业务表关联：** Backend 还会把 `checkpointId` 写入 Prisma 的 `agent_runs` 表，方便按 run 维度查询，但这与 LangGraph checkpoint 是**冗余引用**，真正的状态仍在 Checkpointer 里。

---

## 9. 配置与环境变量

```bash
# 选择 checkpointer 后端：postgres | memory
AGENT_CHECKPOINTER_BACKEND=postgres

# PostgreSQL 连接（PostgresSaver 使用，与 Prisma 可共用同一库）
POSTGRES_URL=postgresql://intelligent:intelligent@127.0.0.1:5432/intelligent_agent

# 或分项配置（agent.runtime.ts 会拼接）
POSTGRES_HOST=127.0.0.1
POSTGRES_PORT=5432
POSTGRES_USER=intelligent
POSTGRES_PASSWORD=intelligent
POSTGRES_DB=intelligent_agent
```

### 9.1 模式选择建议

| 场景 | 推荐 backend | 原因 |
|------|-------------|------|
| 本地开发 / 单元测试 | `memory` | 零依赖、速度快、无需 Docker |
| 开发联调 / Staging | `postgres` | 验证多轮对话持久化、重启不丢数据 |
| 生产环境 | `postgres` | 必须持久化，支持水平扩展下的状态恢复 |
| CI 测试 | `memory` | 测试文件 `agent-core.test.ts` 即采用此模式 |

### 9.2 降级策略

Backend 已实现自动降级：

```
AGENT_CHECKPOINTER_BACKEND=postgres
        │
        ▼
  Postgres 连接成功？ ──否──► fallback 到 memory + console.warn
        │
       是
        ▼
  正常使用 PostgresSaver
```

**注意：** 降级到 memory 后，**之前存在 Postgres 里的 checkpoint 无法读取**，多轮对话会「断档」。生产环境应确保 Postgres 可用。

---

## 10. 动手实验：验证多轮对话

### 10.1 单元测试（Core 层，无需 LLM）

项目已有测试用例，演示 Checkpointer 核心行为：

```typescript
// core/agent-core-ts/test/agent-core.test.ts

it("keeps multi-turn checkpoint history", async () => {
  const manager = await createCheckpointerManager({ backend: "memory" });

  // 构建最小 LangGraph（不调用真实 LLM）
  const graph = new StateGraph(MessagesAnnotation)
    .addNode("reply", async (state) => ({
      messages: [new AIMessage(`echo:${state.messages.at(-1)?.content ?? ""}`)]
    }))
    .addEdge(START, "reply")
    .addEdge("reply", END)
    .compile({ checkpointer: manager.saver });

  // 第一轮
  await graph.invoke(
    { messages: [new HumanMessage("hello")] },
    { configurable: { thread_id: "thread-1" } }
  );

  // 第二轮（同一 thread_id）
  await graph.invoke(
    { messages: [new HumanMessage("again")] },
    { configurable: { thread_id: "thread-1" } }
  );

  // 验证：checkpoint 链 > 1，且最后消息包含 "again"
  const checkpoints = await getThreadCheckpoints(manager.saver, "thread-1");
  expect(checkpoints.length).toBeGreaterThan(1);

  await manager.close();
});
```

运行：

```bash
pnpm --filter @intelligent-agent/agent-core test
```

### 10.2 API 层验证（需启动 Backend）

```bash
# 1. 启动基础设施和服务
make setup
make dev-api-ts

# 2. 获取 JWT Token
curl -X POST http://127.0.0.1:8080/v1/auth/token \
  -H "Content-Type: application/json" \
  -d '{"userId":"demo-user"}'

# 3. 第一轮对话（记住返回的 threadId）
curl -X POST http://127.0.0.1:8080/v1/agents/runs \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "threadId": "my-thread-001",
    "messages": [{ "role": "user", "content": "我叫小明" }]
  }'
# 响应含 checkpointId

# 4. 第二轮（同一 threadId，Agent 应能联系上下文）
curl -X POST http://127.0.0.1:8080/v1/agents/runs \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "threadId": "my-thread-001",
    "messages": [{ "role": "user", "content": "我叫什么名字？" }]
  }'

# 5. 查看 checkpoint 历史
curl http://127.0.0.1:8080/v1/threads/my-thread-001/checkpoints \
  -H "Authorization: Bearer <token>"

# 6. 列出所有线程
curl http://127.0.0.1:8080/v1/threads \
  -H "Authorization: Bearer <token>"
```

### 10.3 最小 Core 代码（不依赖 Backend）

```typescript
import {
  AgentCore,
  createCheckpointerManager,
  getThread
} from "@intelligent-agent/agent-core";

async function main() {
  const manager = await createCheckpointerManager({ backend: "memory" });

  const agent = new AgentCore({
    checkpointSaver: manager.saver,
    defaultProvider: "qwen",
    env: process.env
  });

  const threadId = "demo-thread";

  // 第一轮
  await agent.invoke({ prompt: "1+1等于几？", threadId });

  // 第二轮（同一 threadId，Checkpointer 自动恢复历史）
  const result = await agent.invoke({
    prompt: "刚才的问题答案是多少？",
    threadId
  });

  console.log(result.output);

  // 查看存档
  const thread = await agent.getThread(threadId);
  console.log(`共 ${thread.checkpoints.length} 个 checkpoint`);

  await manager.close();
}

main();
```

---

## 11. 常见问题与踩坑指南

### Q1：我传了 threadId，为什么 Agent 还是「失忆」？

**排查清单：**

1. `AgentCore` 是否注入了 `checkpointSaver`？未注入则每次全新会话
2. `AGENT_CHECKPOINTER_BACKEND=memory` 且进程重启过？Memory 模式数据不持久
3. Postgres 初始化失败静默降级到 memory？看 Backend 启动日志有无 `fallback to memory`
4. 是否命中 Redis 缓存？Backend 缓存命中时**不会调用 Agent**，`checkpointId` 为 null

### Q2：threadId 应该谁生成？

本项目约定：

- 客户端首次对话可省略，Backend 自动生成：`thread-${Date.now()}`
- 后续轮次**必须复用同一 threadId**
- 子代理会为每个子任务生成独立 subThreadId：`${parentThreadId}:sub:${runId}:${taskId}`

### Q3：checkpoint 和 agent_runs 表有什么区别？

| | LangGraph Checkpoint | agent_runs 表 |
|---|---------------------|---------------|
| 管理者 | LangGraph PostgresSaver | Backend Prisma |
| 内容 | 完整图状态（messages 对象链） | 业务摘要（prompt、output、checkpointId 引用） |
| 用途 | 多轮恢复、状态回溯 | 运行审计、前端 Run 列表 |
| 能否单独恢复对话 | ✅ 可以 | ❌ 不行，只是记录 |

### Q4：能否删除某个 thread 的 checkpoint？

当前项目**未封装删除 API**。LangGraph PostgresSaver 底层支持按 thread 清理，但需要直接操作 checkpoint 表或扩展 Core API。生产环境如需 GDPR 合规删除，需额外实现。

### Q5：Memory 模式和 Postgres 模式能混用吗？

**不能。** 同一进程内只初始化一种 Saver。从 Postgres 切到 Memory 后，旧 checkpoint 不可见。

### Q6：invoke 时传的 messages 和 checkpoint 里的 messages 什么关系？

```typescript
graph.invoke(
  { messages: [...(input.messages ?? []), new HumanMessage(input.prompt)] },
  { configurable: { thread_id: input.threadId } }
);
```

LangGraph 行为：

1. 先从 checkpoint 恢复该 thread 的历史 state（含 messages）
2. 再与传入的新 messages **合并**
3. 执行完成后写入新 checkpoint

因此通常**只需传本轮新消息**（放在 `prompt` 或 `messages` 最后一项），不必每次传全量历史——Checkpointer 会帮你恢复。

---

## 12. 进阶话题

### 12.1 Checkpoint 链与 Time Travel

每个 checkpoint 有 `parent_checkpoint_id`，形成链表。LangGraph 支持传入特定 `checkpoint_id` 从任意历史点恢复（本项目暂未封装此 API，但 PostgresSaver 底层支持）。

潜在用途：

- 「回到某一步重新生成」
- A/B 对比不同分支
- 调试 ReAct 循环的中间状态

### 12.2 子代理的 Checkpoint

子代理每个 task 使用独立 subThreadId：

```
main-thread
  ├── main-thread:sub:subrun-123:task-1  (researcher)
  └── main-thread:sub:subrun-123:task-2  (coder)
```

各自有独立 checkpoint 链，互不干扰。`SubagentResult.checkpointId` 记录各子任务的最新 checkpoint。

### 12.3 与 Python Core 的对等实现

Python 侧对应模块：`core/agent-core-python/agent_core/checkpointer.py`

- `make_checkpointer()` ≈ `createCheckpointerManager()`
- `list_threads()` ≈ `listThreads()`
- `get_thread_checkpoints()` ≈ `getThreadCheckpoints()`
- 额外提供 `has_thread_history()`（TS 侧未封装）

### 12.4 生产环境 Checklist

- [ ] `AGENT_CHECKPOINTER_BACKEND=postgres`
- [ ] Postgres 连接池配置合理，监控 `PostgresSaver` 连接健康
- [ ] 进程退出时调用 `shutdownAgentRuntime()` → `checkpointerManager.close()`
- [ ] 定期监控 checkpoint 表大小（长对话会产生大量 checkpoint）
- [ ] 区分 Checkpoint 备份与 Memory Facts 备份策略
- [ ] 前端始终复用同一 `threadId` 进行多轮对话

---

## 附录 A：API 速查表

| 函数 | 输入 | 输出 | 典型调用方 |
|------|------|------|-----------|
| `createCheckpointerManager` | `{ backend?, connectionString? }` | `CheckpointerManager` | `agent.runtime.ts` |
| `listThreads` | `checkpointer, limit?` | `ThreadSummary[]` | `AgentCore.listThreads` |
| `getThreadCheckpoints` | `checkpointer, threadId` | `ThreadCheckpoint[]` | 内部 |
| `getLatestCheckpointId` | `checkpointer, threadId` | `string \| null` | `AgentCore.invoke` |
| `getThread` | `checkpointer, threadId` | `ThreadDetail` | `AgentCore.getThread` |
| `serializeMessage` | `BaseMessage` | `Record<string, unknown>` | `getThreadCheckpoints` 内部 |

## 附录 B：源码文件索引

| 文件 | 内容 |
|------|------|
| `core/agent-core-ts/ts/checkpointer.ts` | CheckpointerManager + 全部 API |
| `core/agent-core-ts/ts/agent.ts` | invoke 时注入 checkpointer、查询 thread |
| `core/agent-core-ts/ts/types.ts` | ThreadSummary / ThreadCheckpoint / ThreadDetail |
| `core/agent-core-ts/test/agent-core.test.ts` | 多轮 checkpoint 测试 |
| `backend/agent-backend-ts/src/runtime/agent.runtime.ts` | 初始化 + 降级 + 生命周期 |
| `backend/agent-backend-ts/src/agent/agent.service.ts` | HTTP 层 thread 查询 |
| `backend/agent-backend-ts/src/agent/agent.controller.ts` | REST 路由 |
| `backend/agent-backend-ts/STORAGE_RESPONSIBILITIES.zh-CN.md` | 存储职责边界 |
| `backend/agent-backend-ts/LANGGRAPH_APIS.zh-CN.md` | LangGraph API 在本项目的落点 |

## 附录 C：学习路径建议

1. **先跑测试** — `pnpm --filter @intelligent-agent/agent-core test`，看 `keeps multi-turn checkpoint history` 用例
2. **读 checkpointer.ts** — 约 150 行，全部 API 都在这一个文件
3. **读 agent.runtime.ts 初始化段** — 理解 Backend 如何装配
4. **用 curl 验证 API** — 同一 threadId 发两轮请求，查 `/v1/threads/:id/checkpoints`
5. **对比 MemoryStore** — 读 `STORAGE_RESPONSIBILITIES.zh-CN.md`，建立「两种存储」的心智模型
6. **读 LangGraph 官方文档** — [Persistence / Checkpointer](https://langchain-ai.github.io/langgraph/concepts/persistence/)

---

*本文档基于 2026-06-09 代码库状态整理。Checkpointer 是 Agent 多轮对话的基石，建议结合 `docs/yunfan/2026-06-09-agent-core-architecture-learning-guide.md` 一起阅读。*
