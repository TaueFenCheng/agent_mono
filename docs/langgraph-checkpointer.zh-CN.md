# LangGraph Checkpointer 使用说明

本文说明项目中 LangChain/LangGraph Agent 的 `checkpointer` 工作方式，以及线程、运行和状态之间的关系。

## 1. Checkpointer 是什么

`checkpointer` 是 LangGraph 提供的状态持久化组件。它会在 Agent 图执行过程中保存状态快照，使 Agent 能够：

- 保留同一线程的多轮对话上下文；
- 在执行中断后恢复；
- 查询线程当前状态和历史状态；
- 支持人机协作、故障恢复和历史回溯。

在 LangChain v1 中，Agent 基于 LangGraph 运行，因此 checkpoint 机制属于 LangGraph 的运行时能力。

参考：[LangGraph Persistence](https://docs.langchain.com/oss/javascript/langgraph/persistence)

## 2. 项目中的初始化

项目在 [`core/agent-core-ts/ts/checkpointer.ts`](../core/agent-core-ts/ts/checkpointer.ts) 中创建 checkpoint 保存器：

```ts
const saver = PostgresSaver.fromConnString(input.connectionString);
await saver.setup();

return {
  kind: "postgres",
  saver,
  close: async () => {
    await saver.end();
  }
};
```

其中：

- `PostgresSaver.fromConnString()` 创建 PostgreSQL 保存器实例；
- `saver.setup()` 初始化 checkpoint 所需的数据库结构；
- `saver` 实现 LangGraph 的 `BaseCheckpointSaver` 接口；
- `saver.end()` 关闭数据库连接。

项目也支持 `MemorySaver`。它的接口相同，但数据只保存在进程内，服务重启后会丢失。

## 3. Agent 如何使用 Saver

创建 Agent 时注入 saver：

```ts
const agent = createAgent({
  model,
  tools,
  systemPrompt,
  checkpointer: saver
});
```

这一步只是告诉 LangGraph：后续执行状态由哪个保存器负责。它不会指定具体线程。

真正指定线程是在调用 Agent 时完成的：

```ts
await agent.invoke(
  {
    messages: [
      { role: "user", content: "你好" }
    ]
  },
  {
    configurable: {
      thread_id: "thread-1",
      run_id: "run-1"
    }
  }
);
```

流式调用使用相同的配置：

```ts
await agent.streamEvents(input, {
  configurable: {
    thread_id: "thread-1",
    run_id: "run-2"
  },
  version: "v2"
});
```

## 4. `thread_id` 是如何传递的

调用链如下：

```text
input.threadId
    ↓
RunnableConfig.configurable.thread_id
    ↓
LangGraph Agent Runtime
    ↓
checkpointer.getTuple() / put() / list()
    ↓
PostgresSaver
    ↓
PostgreSQL checkpoint 表
```

项目代码负责组装：

```ts
{
  configurable: {
    thread_id: input.threadId
  }
}
```

之后由 LangGraph 内部读取 `thread_id`，并调用保存器读取或写入对应线程的 checkpoint。项目不直接操作 checkpoint 表，也不需要自己编写 SQL。

`thread_id` 是 checkpoint 的主要分区键：

- 使用相同的 `thread_id`：继续之前的线程状态；
- 使用新的 `thread_id`：开始一个新的线程；
- 不提供 `thread_id`：无法正确保存或恢复线程状态。

参考：[LangGraph Threads](https://docs.langchain.com/oss/javascript/langgraph/persistence)

## 5. Thread、Run 和 Checkpoint

```text
Thread: thread-1
├── Run: run-1
│   ├── Checkpoint 1
│   ├── Checkpoint 2
│   └── Checkpoint 3
└── Run: run-2
    ├── Checkpoint 4
    └── Checkpoint 5
```

### Thread

一条持续的 Agent 会话或执行线程，由 `thread_id` 标识。它包含该线程下多次运行累积的状态。

### Run

一次具体的 Agent 调用，由 `run_id` 标识。`run_id` 主要用于本次运行的追踪，不负责替代 `thread_id` 进行状态恢复。

### Checkpoint

线程在某个执行阶段的状态快照。一个 Run 通常会产生多个 checkpoint。

## 6. Checkpoint 中保存的状态

Checkpoint 通常包含类似下面的状态：

```ts
{
  values: {
    messages: [...]
  },
  next: [],
  config: {
    configurable: {
      thread_id: "thread-1",
      checkpoint_id: "..."
    }
  },
  metadata: {
    source: "loop",
    writes: {...},
    step: 2
  },
  parentConfig: {...},
  tasks: []
}
```

主要字段：

| 字段 | 说明 |
| --- | --- |
| `values` | 当前图状态，例如消息列表、工具结果和其他状态字段 |
| `next` | 下一步要执行的节点；为空通常表示执行完成 |
| `config` | 当前线程、checkpoint namespace 和 checkpoint ID |
| `metadata` | 状态来源、执行步骤和节点写入内容 |
| `parentConfig` | 上一个 checkpoint 的配置 |
| `tasks` | 当前步骤的任务、中断或错误信息 |

LangGraph 会在图的 super-step 边界保存状态。对于包含多个节点或工具调用的 Agent，这意味着一次请求可能产生多个 checkpoint，而不是只保存最终输出。

## 7. 读取线程状态

读取最新状态时只需要提供 `thread_id`：

```ts
const state = await agent.getState({
  configurable: {
    thread_id: "thread-1"
  }
});
```

读取指定 checkpoint 时，同时传入 `checkpoint_id`：

```ts
const state = await agent.getState({
  configurable: {
    thread_id: "thread-1",
    checkpoint_id: "checkpoint-1"
  }
});
```

项目中的 [`getThreadCheckpoints()`](../core/agent-core-ts/ts/checkpointer.ts) 通过 `checkpointer.list()` 查询线程的 checkpoint 历史，并将其转换为项目自己的 `ThreadCheckpoint` 类型。

LangGraph 也提供线程历史查询能力，用于调试和时间回溯：

```ts
for await (const state of agent.getStateHistory({
  configurable: {
    thread_id: "thread-1"
  }
})) {
  console.log(state);
}
```

参考：[Get state and history](https://docs.langchain.com/oss/javascript/langgraph/persistence)

## 8. 一次请求的状态流程

```text
请求进入 AgentCore
    ↓
根据 threadId 生成 configurable.thread_id
    ↓
LangGraph 从 checkpointer 读取该线程最新 checkpoint
    ↓
恢复 messages 和其他图状态
    ↓
执行模型调用、工具调用和 Agent 节点
    ↓
每个 super-step 写入新的 checkpoint
    ↓
返回最终 state 和 Agent 输出
```

如果使用 PostgreSQL，服务重启后仍可以根据同一个 `thread_id` 恢复状态；如果使用 `MemorySaver`，服务重启后线程状态会消失。

## 9. Checkpointer 和 MemoryStore 的区别

| 机制 | 保存内容 | 作用范围 |
| --- | --- | --- |
| Checkpointer | Agent 图状态、消息、工具调用中间状态、恢复信息 | 单个 `thread_id` |
| MemoryStore | 显式保存的记忆事实 | 可以按线程或用户跨线程共享 |
| RAG / Attachment | 附件和文档的解析、索引、检索内容 | 文档或知识库 |

Checkpointer 更接近“短期线程状态”；MemoryStore 更接近“业务记忆”。二者可以同时使用，但不能互相替代。

## 10. 常见注意事项

### 必须稳定传递 `thread_id`

如果每次请求都生成新的线程 ID，Agent 就无法读取之前的对话状态。

### 生产环境应使用数据库 Saver

`MemorySaver` 适合测试和本地实验；生产环境应使用 PostgreSQL、Redis 或其他持久化实现。

### 初始化数据库结构

数据库型 checkpointer 需要先执行初始化或迁移。项目当前通过 `saver.setup()` 完成初始化。官方建议将数据库迁移作为独立部署步骤，或在服务启动时确保执行。[官方数据库管理说明](https://docs.langchain.com/oss/javascript/langgraph/add-memory#database-management)

### 状态结构需要保持兼容

已有线程恢复时，当前 Agent 图和状态结构需要能够读取旧 checkpoint。修改节点名称、状态字段或消息结构时，应考虑已有线程的兼容性。

### 不要把长期记忆全部塞进 checkpoint

Checkpoint 属于线程级状态。需要跨线程共享的用户偏好、事实或业务数据，应使用 Store/MemoryStore，而不是无限追加到消息历史中。

## 11. 项目实现位置

- Agent 构造和调用：[`core/agent-core-ts/ts/agent.ts`](../core/agent-core-ts/ts/agent.ts)
- Checkpointer 创建：[`core/agent-core-ts/ts/checkpointer.ts`](../core/agent-core-ts/ts/checkpointer.ts)
- Agent Core 类型定义：[`core/agent-core-ts/ts/types.ts`](../core/agent-core-ts/ts/types.ts)
- TypeScript 后端运行时：[`backend/agent-backend-ts/src/runtime/agent.runtime.ts`](../backend/agent-backend-ts/src/runtime/agent.runtime.ts)
