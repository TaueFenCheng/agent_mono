# LangGraph API 说明与本项目用法

本文档只描述 `intelligentAgent` 当前代码中**实际使用到**的 `LangGraph` 相关 API，以及这些 API 在 `agent-backend-ts` 里的落点。

## 1. 先看项目分层

`agent-backend-ts` 本身不是直接在 Controller / Service 里组装 LangGraph，而是通过 `core/agent-core-ts` 暴露统一能力，再由 backend 调用。

当前链路是：

1. backend 接收 HTTP / SSE / job 请求
2. backend runtime 初始化 `AgentCore`
3. `AgentCore` 在 `core/agent-core-ts` 内部调用 `LangGraph`
4. backend 只负责把结果、流事件、线程历史、checkpoint 信息暴露出去

因此：

- `LangGraph` 生产级调用主入口在  
  [agent.ts](/Users/tangjiaqiang/code/intelligentAgent/core/agent-core-ts/ts/agent.ts)
- `LangGraph checkpointer` 相关逻辑在  
  [checkpointer.ts](/Users/tangjiaqiang/code/intelligentAgent/core/agent-core-ts/ts/checkpointer.ts)
- backend 对这些能力的封装入口在  
  [agent.runtime.ts](/Users/tangjiaqiang/code/intelligentAgent/backend/agent-backend-ts/src/runtime/agent.runtime.ts)

## 2. 本项目实际用到的 LangGraph API

### 2.1 `createReactAgent`

来源：

```ts
import { createReactAgent } from "@langchain/langgraph/prebuilt";
```

作用：

- 创建一个基于 ReAct 模式的 agent graph。
- 它负责把 `LLM + tools + prompt + checkpointer` 组合成可执行图。

本项目中的使用方式：

```ts
const graph = createReactAgent({
  llm: routed.chatModel,
  tools,
  prompt: promptSections.join("\\n\\n"),
  checkpointer: this.options.checkpointSaver,
  name: "intelligent-agent-core"
});
```

当前项目里它承担的职责：

1. 接收 provider-router 产出的模型实例
2. 接收工具注册表构建出的 tools
3. 接收 memory / skills 拼装后的 system prompt
4. 接收 checkpointer，用于线程持久化和多轮恢复

落点：

- [agent.ts](/Users/tangjiaqiang/code/intelligentAgent/core/agent-core-ts/ts/agent.ts)

### 2.2 `graph.invoke(...)`

作用：

- 执行一次图运行。
- 输入消息状态，返回最终状态。

本项目中的使用方式：

```ts
const state = await graph.invoke(
  {
    messages: [...(input.messages ?? []), new HumanMessage(input.prompt)]
  },
  {
    configurable: {
      thread_id: input.threadId,
      run_id: input.runId ?? input.threadId
    }
  }
);
```

关键点：

1. 输入状态当前只用到了 `messages`
2. `configurable.thread_id` 是会话恢复的核心键
3. `configurable.run_id` 用于区分本次执行

执行完成后，项目会从 `state.messages` 中提取最后一个 `AIMessage`，生成自己的 `AgentInvokeOutput`。

落点：

- [agent.ts](/Users/tangjiaqiang/code/intelligentAgent/core/agent-core-ts/ts/agent.ts)

### 2.3 `BaseCheckpointSaver`

来源：

```ts
import { BaseCheckpointSaver } from "@langchain/langgraph";
```

作用：

- 定义 checkpoint 持久化的统一抽象。
- `MemorySaver` 和 `PostgresSaver` 都实现它。

本项目中的用途：

1. 作为 `AgentCoreOptions.checkpointSaver` 的统一类型
2. 作为线程历史查询的统一输入
3. 屏蔽内存模式和 PostgreSQL 模式的差异

落点：

- [checkpointer.ts](/Users/tangjiaqiang/code/intelligentAgent/core/agent-core-ts/ts/checkpointer.ts)
- [types.ts](/Users/tangjiaqiang/code/intelligentAgent/core/agent-core-ts/ts/types.ts)

### 2.4 `MemorySaver`

来源：

```ts
import { MemorySaver } from "@langchain/langgraph";
```

作用：

- LangGraph 提供的内存版 checkpointer。
- 适合本地开发、测试、Postgres 不可用时降级运行。

本项目中的用途：

1. 当 `createCheckpointerManager()` 选择 `memory` 时使用
2. 作为 Postgres 初始化失败时的 fallback
3. 在测试里验证多轮对话和 checkpoint 行为

落点：

- [checkpointer.ts](/Users/tangjiaqiang/code/intelligentAgent/core/agent-core-ts/ts/checkpointer.ts)
- [agent-core.test.ts](/Users/tangjiaqiang/code/intelligentAgent/core/agent-core-ts/test/agent-core.test.ts)

### 2.5 `PostgresSaver.fromConnString(...)`

来源：

```ts
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
```

作用：

- 创建 PostgreSQL 持久化 checkpointer。
- 用于会话历史、checkpoint 链、重启恢复。

本项目中的使用方式：

```ts
const saver = PostgresSaver.fromConnString(input.connectionString);
await saver.setup();
```

项目中进一步封装为：

- `createCheckpointerManager({ backend, connectionString })`

关闭时：

```ts
await saver.end();
```

落点：

- [checkpointer.ts](/Users/tangjiaqiang/code/intelligentAgent/core/agent-core-ts/ts/checkpointer.ts)

### 2.6 `checkpointer.list(...)`

作用：

- 遍历某个线程或全局范围内的 checkpoint。
- 这是本项目读取线程历史的核心 API。

本项目里的两个典型用法：

1. 列出线程列表

```ts
for await (const checkpoint of checkpointer.list(normalizeThreadConfig(), { limit })) {
  ...
}
```

2. 读取某个线程的全部 checkpoint

```ts
for await (const checkpoint of checkpointer.list(config)) {
  ...
}
```

项目基于这个 API 做了：

1. `listThreads()`
2. `getThreadCheckpoints()`
3. `getLatestCheckpointId()`
4. `getThread()`

落点：

- [checkpointer.ts](/Users/tangjiaqiang/code/intelligentAgent/core/agent-core-ts/ts/checkpointer.ts)

### 2.7 `RunnableConfig`

来源：

```ts
import type { RunnableConfig } from "@langchain/core/runnables";
```

作用：

- 用来给 LangGraph / Runnable 传递配置。
- 本项目主要用它承载 `configurable.thread_id`。

本项目中的使用：

```ts
function normalizeThreadConfig(threadId?: string): RunnableConfig {
  return { configurable: threadId ? { thread_id: threadId } : {} };
}
```

意义：

- 后续所有 checkpoint 查询，都通过同一套线程配置组织

落点：

- [checkpointer.ts](/Users/tangjiaqiang/code/intelligentAgent/core/agent-core-ts/ts/checkpointer.ts)

## 3. 只在测试中使用的 LangGraph API

下面这些 API 目前**不是生产主链路**的一部分，主要用于测试和验证 LangGraph 的基本行为。

### 3.1 `StateGraph`

作用：

- 手工构建一个状态图。
- 比 `createReactAgent` 更底层，适合自定义节点和边。

本项目当前用途：

- 在测试里构建一个最小图，验证 checkpointer 的多轮历史能力。

### 3.2 `MessagesAnnotation`

作用：

- 提供消息状态的 annotation 结构。

本项目当前用途：

- 给测试里的 `StateGraph` 提供标准消息状态定义。

### 3.3 `START` / `END`

作用：

- 图的起止节点常量。

本项目当前用途：

- 在测试里定义：
  - `START -> reply`
  - `reply -> END`

落点：

- [agent-core.test.ts](/Users/tangjiaqiang/code/intelligentAgent/core/agent-core-ts/test/agent-core.test.ts)

## 4. backend 实际暴露了哪些与 LangGraph 相关的能力

虽然 backend 不直接组图，但它把 `LangGraph` 能力转成了自己的 runtime API。

主要入口在：

- [agent.runtime.ts](/Users/tangjiaqiang/code/intelligentAgent/backend/agent-backend-ts/src/runtime/agent.runtime.ts)

### 4.1 `invokeAgent(...)`

作用：

- backend 的同步执行入口
- 内部调用 `runtime.core.invoke(...)`

最终会走到：

1. `createReactAgent(...)`
2. `graph.invoke(...)`
3. `getLatestCheckpointId(...)`

### 4.2 `invokeAgentStream(...)`

作用：

- backend 的流式执行入口
- 内部调用 `runtime.core.invokeStream(...)`

注意：

- 这里的“流式”是**项目自定义事件流**，不是当前直接使用 LangGraph 的原生 `stream/astream` API。
- 当前返回的是 `AgentRunEvent` 序列，例如：
  - `run_start`
  - `model_selected`
  - `tools_resolved`
  - `tool_start`
  - `tool_end`
  - `run_end`
  - `error`

### 4.3 `invokeAgentSubrun(...)`

作用：

- backend 的子代理同步执行入口
- 子代理本身不是 LangGraph 的多 agent 原生图编排，而是项目层的 orchestrator
- 但每个子任务内部仍然会回到 `AgentCore.invoke(...)`，因此仍会复用 `createReactAgent + graph.invoke`

### 4.4 `invokeAgentSubrunStream(...)`

作用：

- backend 的子代理流式事件入口
- 暴露 `plan_created / subagent_start / subagent_end / subagent_error / run_end`

### 4.5 `listRuntimeThreads(...)` / `getRuntimeThread(...)`

作用：

- 把 `checkpointer.list(...)` 封装成对外线程 API
- 这是 backend 层真正把 `LangGraph checkpoint` 数据暴露出来的地方

## 5. 当前项目没有直接使用的 LangGraph 能力

为了避免误解，下面这些方向在当前仓库里**还没有直接接入**：

1. `graph.stream()` / `graph.astream()`
- 当前流式事件不是 LangGraph 原生 token/event stream，而是项目自己封装的 `EventStream`

2. LangGraph 原生多 agent supervisor graph
- 当前 `subagent` 是项目自定义编排层，不是直接用 LangGraph supervisor 模式搭的图

3. LangGraph store / semantic memory 官方能力
- 当前 memory 是项目自己抽象的 `MemoryStore`，落在内存或 PostgreSQL，不是 LangGraph store

4. 原生人机中断 / resume 节点控制
- 当前只实现了 checkpoint 持久化与线程恢复，没有直接使用 interrupt/resume API

## 6. 结合本项目，如何理解这些 API 的职责边界

可以把当前实现理解成三层：

### 第 1 层：LangGraph 原生能力

主要包括：

1. `createReactAgent`
2. `graph.invoke`
3. `BaseCheckpointSaver`
4. `MemorySaver`
5. `PostgresSaver`
6. `checkpointer.list`

这一层负责：

- agent 图执行
- checkpoint 持久化
- 线程恢复

### 第 2 层：agent-core 的二次封装

主要包括：

1. `AgentCore.invoke`
2. `AgentCore.invokeStream`
3. `AgentCore.invokeSubagents`
4. `AgentCore.invokeSubagentsStream`
5. `createCheckpointerManager`
6. `listThreads / getThread / getLatestCheckpointId`

这一层负责：

- provider 路由
- tools 注入
- skills / memory prompt 拼装
- 事件流标准化
- checkpoint 读取结果结构化

### 第 3 层：backend API 层

主要包括：

1. `invokeAgent`
2. `invokeAgentStream`
3. `invokeAgentSubrun`
4. `invokeAgentSubrunStream`
5. thread / checkpoint 查询接口

这一层负责：

- HTTP / SSE / job 接口暴露
- DTO 校验
- 缓存、鉴权、异常处理、队列化

## 7. 当前项目里最重要的两个 LangGraph 约定

### 7.1 `thread_id` 是会话恢复主键

只要同一个 `thread_id` 持续传入：

- LangGraph checkpointer 就能把多轮对话接起来
- backend 的 thread 查询接口也能读到同一条会话历史

这是当前项目会话连续性的核心。

### 7.2 `checkpointSaver` 决定是否具备持久恢复能力

如果使用：

- `MemorySaver`
  - 仅进程内有效
  - 重启即丢失

如果使用：

- `PostgresSaver`
  - 可跨进程、跨重启恢复
  - backend 的 thread/checkpoint API 才真正有长期价值

## 8. 简短结论

当前 `intelligentAgent` 对 `LangGraph` 的使用比较克制，核心集中在两件事：

1. 用 `createReactAgent + graph.invoke` 跑单次 agent 执行
2. 用 `checkpointer` 做多轮线程恢复和历史查询

也就是说，当前项目并没有把 LangGraph 当成“所有 runtime 逻辑都交给它”的平台，而是把它作为：

- agent 执行引擎
- checkpoint 持久化引擎

其它能力，例如：

- subagent 编排
- 事件流
- memory 抽象
- MCP 注入
- backend API

都还是项目自己的封装层。
