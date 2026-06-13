# 流式架构与 LangGraph streamEvents

## 流式链路

```
浏览器 → Next.js /api/chat → NestJS /v1/agents/runs/stream → AgentCore.invokeEventStream → LangGraph graph.streamEvents
```

## LangGraph 流式 API

| API | 说明 | 使用场景 |
|-----|------|----------|
| `graph.invoke()` | 一次性执行，返回最终状态 | 非流式调用 `POST /v1/agents/runs` |
| `graph.streamEvents()` | 逐事件推送（token、工具调用等） | 流式调用 `POST /v1/agents/runs/stream` |

### streamEvents 模式

```typescript
const streamConfig = {
  configurable: { thread_id, run_id },
  streamMode: ["messages"] as StreamMode[],
  version: "v2"
};
```

- `streamMode: "values"` — 每次状态变化推送完整状态
- `streamMode: "messages"` — 逐消息块推送，包含 `on_chat_model_stream`（LLM token）、`on_tool_start` 等事件

### 流式事件类型

| 事件 | 说明 |
|------|------|
| `on_chat_model_stream` | LLM token 级输出，`event.data.chunk.content` 为文本 |
| `on_tool_start` | 工具开始调用 |
| `on_tool_end` | 工具调用结束 |

## 已知问题：ChatAnthropic + streamEvents 不兼容

### 现象
- `POST /v1/agents/runs`（非流式）正常返回
- `POST /v1/agents/runs/stream`（流式）返回空输出
- SSE 事件流中 `text_delta` 事件缺失，仅含 `run_start`、`model_selected`、`tools_resolved`、`run_end`

### 根因
LangGraph 的 `streamEvents` 配合 `streamMode: "messages"` 时，对 `ChatAnthropic`（@langchain/anthropic）的兼容性不如 `ChatOpenAI`。Anthropic SDK 的底层流式实现与 LangGraph v2 事件系统的对接存在差异，导致 `on_chat_model_stream` 事件未被正确触发。

影响范围：所有通过 Anthropic 兼容 API（包括小米、Xiaomi token-plan 等第三方代理）的流式调用。

### 修复方案

**`core/agent-core-ts/ts/agent.ts`** — `invokeEventStream` 方法：

1. 将 `graph.streamEvents` 失败后的 fallback 从 `catch` 块移到 try/catch 之后，确保即使 streamEvents 不抛异常也会执行 fallback
2. fallback 使用不带 `streamMode` 的干净 config 调用 `graph.invoke`，避免配置污染

```typescript
try {
  // streamEvents 尝试流式
  for await (const event of graph.streamEvents(streamInput, streamConfig)) {
    if (event.event === "on_chat_model_stream" && event.data?.chunk?.content) {
      // 收集 token
    }
  }
} catch { /* ignore */ }

if (!fullOutput) {
  // fallback：不带 streamMode 的 invoke
  const state = await graph.invoke(streamInput, { configurable: { thread_id, run_id } });
  fullOutput = extractLastAssistantText(state.messages);
}
```

**`frontend/web/app/api/chat/route.ts`** — 前端代理路由：

增加 `hasStreamedText` 标记，如果全程无 `text_delta` 事件，`run_end` 时用 `output` 字段兜底输出。

```typescript
let hasStreamedText = false;
// ... 在 text_delta 处理中设为 true
if (event.type === "run_end" && event.output) {
  if (!hasStreamedText) controller.enqueue(encoder.encode(event.output));
}
```

### 限制
- 回退到 `graph.invoke` 后无法逐 token 流式输出，前端需等待完整响应
- 如需真正的 token 级流式 + Anthropic，可考虑直接使用 Anthropic SDK 的原生流式 API，绕过 LangGraph streamEvents
