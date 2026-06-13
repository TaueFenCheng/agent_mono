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
| `on_chat_model_stream` | LLM token 级输出，`event.data.chunk` 为 `AIMessageChunk` |
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

---

## 推理过程输出（reasoning / thinking）

支持将模型的**思考过程**（chain-of-thought）以 `reasoning_delta` 事件独立推送到前端。

### 数据流

```
模型 API 返回 reasoning_content
  → LangChain ChatOpenAI additional_kwargs.reasoning_content
    → AgentCore 推 reasoning_delta 事件
      → SSE data: {"type":"reasoning_delta","text":"..."}
        → 前端渲染 【思考过程】...【/思考过程】
```

### 后端提取（`core/agent-core-ts/ts/agent.ts`）

在 `streamEvents` 循环中，从 `AIMessageChunk` 的 `additional_kwargs` 同时检测两个字段：

| 字段 | 来源 |
|------|------|
| `reasoning_content` | DeepSeek-R1 等推理模型 |
| `thinking` | Anthropic Claude extended thinking 等 |

```typescript
const reasoningContent = (chunk?.additional_kwargs?.reasoning_content ??
  chunk?.additional_kwargs?.thinking) as string | undefined;
if (reasoningContent) {
  stream.push({ type: "reasoning_delta", runId, threadId, text: reasoningContent, at: ... });
}
```

### 事件类型（`core/agent-core-ts/ts/events.ts`）

```typescript
| {
    type: "reasoning_delta";
    runId: string;
    threadId: string;
    text: string;
    at: string;
  }
```

### 前端渲染（`frontend/web/app/api/chat/route.ts`）

SSE 处理器管理 `inReasoning` 状态，在 `reasoning_delta` 和 `text_delta` 之间插入标记：

```
首次 reasoning_delta → 输出 "\n【思考过程】\n"
后续 reasoning_delta → 直接输出文本
首次 text_delta      → 输出 "\n【/思考过程】\n\n"，关闭推理状态
run_end / error      → 若仍处于推理状态，先关闭标记再输出
```

### SSE 事件格式

```
data: {"type":"run_start",...}

data: {"type":"reasoning_delta","text":"Let me think about this step by step..."}  ← 推理过程

data: {"type":"reasoning_delta","text":"First, I need to..."}

data: {"type":"text_delta","text":"最终答案"}  ← 正式回答

data: {"type":"run_end",...}
```

### 注意事项

- 当前 provider `deepseek-v4-flash` 不输出 `reasoning_content`，看不到推理过程
- 需要推理模型（如 DeepSeek-R1、支持 `reasoning_content` 的模型）才能生效
- 如果 LangChain `ChatOpenAI` 未正确传递 `reasoning_content`，需自定义 `ChatOpenAI` 子类或在原始 API 响应层处理
- `Anthropic extended thinking` 需在 `ChatAnthropic` 构造时传入 `thinking` 参数才会启用

---

## LangGraph 工具系统

### 核心 API：`createReactAgent`

```typescript
import { createReactAgent } from "@langchain/langgraph/prebuilt";

const graph = createReactAgent({
  llm: chatModel,                          // LangChain BaseChatModel
  tools: structuredToolArray,               // StructuredToolInterface[]
  prompt: "You are a helpful assistant.",   // 系统提示词
  checkpointer: checkpointSaver,            // 可选：对话持久化
  name: "my-agent",                         // 可选：agent 名称
});
```

`createReactAgent` 内部实现了一个 **ReAct (Reasoning + Acting)** 循环：

```
LLM 推理 → 决定调用工具 → 执行工具 → 结果反馈 LLM → 重复 → 生成最终回答
```

### 三种工具注册方式

| 方式 | 方法 | 适用场景 |
|------|------|----------|
| **内置工具** | 在 `createBuiltinTools()` 中用 `tool()` 定义 | 固定、通用的工具（get_time、calculate 等） |
| **本地工具** | `registry.registerLocalTool(spec)` | 按需注册，带 Zod schema 验证 |
| **MCP 插件** | `registry.useMcpPlugin(plugin)` | 外部 MCP 服务器提供的工具 |

### 注册本地工具示例

```typescript
import { z } from "zod";

registry.registerLocalTool({
  name: "search_web",
  description: "搜索互联网，返回相关结果",
  schema: z.object({
    query: z.string().describe("搜索关键词"),
    maxResults: z.number().optional().default(5),
  }),
  executionMode: "sequential",  // 或 "parallel"
  timeoutMs: 30000,
  invoke: async (input, context) => {
    // input: { query: string; maxResults?: number }
    // context: { threadId?: string; runId?: string; metadata?: Record<string, unknown> }
    const results = await fetchSearchApi(input.query, input.maxResults);
    return results;
  },
});
```

### 注册结构化工具示例

```typescript
import { tool } from "@langchain/core/tools";
import { z } from "zod";

const myTool = tool(
  async (input) => {
    return `处理完成: ${input.data}`;
  },
  {
    name: "process_data",
    description: "处理输入数据并返回结果",
    schema: z.object({
      data: z.string().describe("输入数据"),
      mode: z.enum(["fast", "accurate"]).optional().default("fast"),
    }),
  }
);

registry.registerStructuredTool(myTool);
```

### 注册 MCP 插件

```typescript
import { StaticMcpToolPlugin, type McpToolDescriptor } from "../mcp.js";

const myPlugin = new StaticMcpToolPlugin("my-service", [
  {
    name: "get_user_info",
    description: "查询用户信息",
    schema: z.object({ userId: z.string() }),
    invoke: async (input, context) => {
      const db = (context.services as any)?.prisma;
      return db.user.findUnique({ where: { id: input.userId } });
    },
  },
]);

registry.useMcpPlugin(myPlugin);
```

### 工具构建流程

```
registry.buildTools(options)
  ├── structuredTools.map(wrapWithPolicy)
  ├── createBuiltinTools(options, context).map(wrapWithPolicy)
  ├── localTools.map(spec → tool(spec).map(wrapWithPolicy))
  ├── buildMcpTools(context).map(wrapWithPolicy)
  ├── toolAllowlist 过滤（可选）
  └── ToolExecutionCoordinator 编排
       └── → StructuredToolInterface[] → createReactAgent({ tools })
```

### 工具执行事件

### 添加文件读写和执行命令工具

当前内置工具不包含文件操作和命令执行。可通过 `registerLocalTool` 添加到 `agent.runtime.ts` 中：

```typescript
// backend/agent-backend-ts/src/runtime/agent.runtime.ts
// 在 createCore 中，注册内置工具之后

import { registerBuiltinTools } from "@intelligent-agent/agent-core";

// ... 现有代码
const registry = registerBuiltinTools(new DefaultAgentToolRegistry());

// 注册文件系统和命令工具
registry.registerLocalTool({
  name: "read_file",
  description: "读取指定文件的全部内容。支持相对路径和绝对路径。",
  schema: z.object({
    path: z.string().describe("文件路径"),
    offset: z.number().optional().describe("起始行号（从 0 开始）"),
    limit: z.number().optional().describe("读取行数"),
  }),
  executionMode: "sequential",
  timeoutMs: 10000,
  invoke: async (input) => {
    const fs = await import("fs/promises");
    const filePath = path.resolve(input.path);

    if (input.offset !== undefined || input.limit !== undefined) {
      const content = await fs.readFile(filePath, "utf-8");
      const lines = content.split("\n");
      const start = input.offset ?? 0;
      const end = input.limit ? start + input.limit : lines.length;
      return lines.slice(start, end).join("\n");
    }

    const content = await fs.readFile(filePath, "utf-8");
    return content;
  },
});

registry.registerLocalTool({
  name: "write_file",
  description: "写入内容到指定文件。如果文件不存在则创建，存在则覆盖。",
  schema: z.object({
    path: z.string().describe("文件路径"),
    content: z.string().describe("写入内容"),
  }),
  executionMode: "sequential",
  timeoutMs: 10000,
  invoke: async (input) => {
    const fs = await import("fs/promises");
    const filePath = path.resolve(input.path);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, input.content, "utf-8");
    const stat = await fs.stat(filePath);
    return `已写入 ${filePath} (${stat.size} bytes)`;
  },
});

registry.registerLocalTool({
  name: "execute_command",
  description: "在 Shell 中执行命令并返回标准输出和标准错误。命令将在工作目录下执行。",
  schema: z.object({
    command: z.string().describe("要执行的 Shell 命令"),
    workdir: z.string().optional().describe("工作目录，默认为项目根目录"),
    timeout: z.number().optional().default(30000).describe("超时时间(ms)"),
  }),
  executionMode: "sequential",
  timeoutMs: 60000,
  invoke: async (input) => {
    const { execSync } = await import("child_process");
    try {
      const output = execSync(input.command, {
        cwd: input.workdir ?? process.cwd(),
        timeout: input.timeout ?? 30000,
        encoding: "utf-8",
        maxBuffer: 10 * 1024 * 1024,
      });
      return output || "(命令执行成功，无输出)";
    } catch (error: any) {
      if (error.stdout) return error.stdout;
      if (error.stderr) return `错误: ${error.stderr}`;
      return `执行失败: ${error.message}`;
    }
  },
});

registry.registerLocalTool({
  name: "list_files",
  description: "列出指定目录中的文件和子目录。",
  schema: z.object({
    path: z.string().describe("目录路径"),
    pattern: z.string().optional().describe("glob 模式过滤，如 *.ts"),
  }),
  executionMode: "sequential",
  timeoutMs: 10000,
  invoke: async (input) => {
    const fs = await import("fs/promises");
    const dirPath = path.resolve(input.path);
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    return entries.map((e) => ({
      name: e.name,
      type: e.isDirectory() ? "dir" : "file",
      size: e.isFile() ? (await fs.stat(path.join(dirPath, e.name))).size : null,
    }));
  },
});
```

**安全注意事项：**

- `path.resolve()` 不会限制目录范围，Agent 可以读取项目外的文件。如需沙箱，加入 `path.resolve(input.path).startsWith(ALLOWED_ROOT)` 检查
- `execute_command` 有安全风险，建议：
  - 限制可执行命令的白名单（如 `["ls", "cat", "grep", "node", "pnpm"]`）
  - 使用 `cwd` 限制工作目录
  - 考虑用 `execa` 替代 `execSync` 获得更好的安全性
- 超时设置：文件操作 10s，命令执行 30-60s

工具执行时会发出以下事件，可通过 `onToolEvent` 回调消费：

```typescript
type AgentToolEvent =
  | { type: "tool_start";  toolName: string; input: unknown; threadId?: string }
  | { type: "tool_end";    toolName: string; input: unknown; output: unknown; durationMs: number; threadId?: string }
  | { type: "tool_error";  toolName: string; input: unknown; error: string; durationMs: number; threadId?: string };
```

在流式模式下，这些事件会通过 SSE 推送到前端：

```
data: {"type":"tool_start","toolName":"calculate","input":{"expression":"2+2"},"threadId":"..."}
data: {"type":"tool_end","toolName":"calculate","input":{"expression":"2+2"},"output":4,"durationMs":5,"threadId":"..."}
```

## 代码示例与用法

### 1. 前端消费 SSE 流（浏览器端）

```typescript
// frontend/web/lib/chat.ts
export async function sendChatMessage(
  message: string,
  threadId: string,
  onToken: (text: string) => void,
  accessToken: string
): Promise<void> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      threadId,
      messages: [
        {
          parts: [{ type: "text", text: message }],
          id: crypto.randomUUID(),
          role: "user",
        },
      ],
    }),
  });

  if (!res.ok) throw new Error(`Chat failed: ${res.status}`);

  const reader = res.body?.getReader();
  if (!reader) return;

  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const text = decoder.decode(value, { stream: true });
    onToken(text);
  }
}
```

### 2. curl 测试流式接口

```bash
# 获取 token
TOKEN=$(curl -s -X POST http://127.0.0.1:8080/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin123"}' | \
  python3 -c "import sys,json; print(json.load(sys.stdin)['data']['accessToken'])")

# 流式调用（观察 SSE 事件）
curl -s -N -X POST http://127.0.0.1:8080/v1/agents/runs/stream \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "threadId": "test-curl",
    "messages": [{"role": "user", "content": "你好"}]
  }'

# 非流式调用（对比）
curl -s -X POST http://127.0.0.1:8080/v1/agents/runs \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "threadId": "test-curl-sync",
    "messages": [{"role": "user", "content": "你好"}]
  }' | python3 -m json.tool
```

### 3. 通过前端代理路由测试

```bash
TOKEN=$(curl -s -X POST http://127.0.0.1:8080/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin123"}' | \
  python3 -c "import sys,json; print(json.load(sys.stdin)['data']['accessToken'])")

# 经过 Next.js /api/chat 代理
curl -s -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "threadId": "web-test",
    "messages": [{"parts":[{"type":"text","text":"你好"}],"role":"user"}]
  }'
```

### 4. 切换 Provider

通过 `provider` 和 `model` 字段覆盖默认 Provider：

```bash
curl -s -X POST http://127.0.0.1:8080/v1/agents/runs/stream \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "threadId": "test-provider",
    "provider": "deepseek",
    "model": "deepseek-v4-flash",
    "messages": [{"role": "user", "content": "hello"}]
  }'
```

在前端请求中：

```typescript
fetch("/api/chat", {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
  body: JSON.stringify({
    threadId,
    messages: [...],
    provider: "anthropic",        // 可选，覆盖默认 provider
    model: "mimo-v2.5-pro",       // 可选，覆盖默认模型
  }),
});
```

### 5. 注册自定义 Provider

```typescript
// core/agent-core-ts/ts/provider-router.ts
providerRegistry.registerProvider("my-provider", {
  apiKeyEnv: "MY_API_KEY",
  baseUrlEnv: "MY_BASE_URL",
  modelEnv: "MY_MODEL",
  defaultBaseUrl: "https://api.my-provider.com/v1",
  defaultModel: "my-model",
  aliases: ["my"],
});

// 或在 .env 中配置：
// AGENT_PROVIDER=my-provider
// MY_API_KEY=sk-xxx
// MY_BASE_URL=https://api.my-provider.com/v1
// MY_MODEL=my-model
```

### 6. 事件流格式参考

后端 SSE 事件格式（逐行 `data: {...}\n\n`）：

```
data: {"type":"run_start","runId":"nest-...","threadId":"...","at":"..."}

data: {"type":"model_selected","provider":"anthropic","model":"mimo-v2.5-pro","baseUrl":"https://...","temperature":0.2,"at":"..."}

data: {"type":"tools_resolved","toolNames":["get_time","echo_text",...],"count":7,"at":"..."}

data: {"type":"reasoning_delta","runId":"nest-...","threadId":"...","text":"Let me think...","at":"..."}  ← 推理过程（仅推理模型）

data: {"type":"text_delta","runId":"nest-...","threadId":"...","text":"你好","at":"..."}  ← token 级

data: {"type":"run_end","runId":"nest-...","threadId":"...","provider":"anthropic","output":"你好！有什么我可以帮你的吗？","checkpointId":"...","toolCount":7,"at":"..."}

data: {"type":"error","runId":"nest-...","threadId":"...","message":"...","at":"..."}
```

前端解析逻辑：

```typescript
const lines = chunk.split("\n");
for (const line of lines) {
  const trimmed = line.trim();
  if (!trimmed || !trimmed.startsWith("data: ")) continue;
  const event = JSON.parse(trimmed.slice(6));
  switch (event.type) {
    case "text_delta":  onToken(event.text); break;
    case "run_end":     onDone(event.output); break;
    case "error":       onError(event.message); break;
  }
}
```
