# 项目功能缺口审计

> 任务：`06-10-agent-practice-roadmap`  
> 来源：代码走读 + 子 Agent 探索（2026-06-10）

---

## 1. 总体结论

**TS 栈是参考实现**；Python 在 HTTP 层「看起来对齐」，但 core/runtime 落后；前端只暴露了后端能力的一小部分。若目标是**深入实践 Agent 开发**，优先选能触及 Core 编排、事件流、工具/MCP、多 Agent 的路径。

---

## 2. Core 层缺口（TS vs Python）

| 能力 | TS | Python | 实践价值 |
|------|----|--------|----------|
| Subagent 编排 | ✅ `subagent.ts` | ❌ 无 | ⭐⭐⭐⭐⭐ |
| 流式 + 事件 | ✅ `event-stream.ts` | ❌ 仅 sync invoke | ⭐⭐⭐⭐⭐ |
| 工具执行策略 | ✅ 超时/并行/allowlist | ❌ 无包装 | ⭐⭐⭐⭐ |
| MCP 插件 helpers | ✅ StaticMcpToolPlugin 等 | 仅 env loader | ⭐⭐⭐⭐ |
| 本地工具注册 | ✅ registerLocalTool | ❌ builtins only | ⭐⭐⭐ |
| Provider 矩阵 | qwen/glm/openai/deepseek | + anthropic/gemini | ⭐⭐⭐⭐ |
| 测试 | 4 个 test 文件 | 0 | ⭐⭐⭐ |

---

## 3. Backend 缺口

| 能力 | TS Backend | Python Backend | 实践价值 |
|------|------------|----------------|----------|
| SSE `/runs/stream` | ✅ | 路由有，runtime 无方法 | ⭐⭐⭐⭐⭐ |
| Subagent API | ✅ | 路由有，runtime 无方法 | ⭐⭐⭐⭐⭐ |
| BullMQ 异步任务 | ✅ | ❌ | ⭐⭐⭐⭐ |
| JWT 鉴权 | ✅ 全局 Guard | deps 存在但未挂载 | ⭐⭐⭐ |
| 附件解析/OCR/chunk | ✅ 完整 | upload only | ⭐⭐⭐⭐⭐ |
| provider_configs | ✅ | 传入不支持的 dataclass | ⭐⭐⭐ |

---

## 4. 前端 / SDK 缺口

| 能力 | 后端支持 | 前端/SDK | 实践价值 |
|------|----------|----------|----------|
| SSE 流式 + tool 事件 | ✅ TS | ❌ 同步 only | ⭐⭐⭐⭐⭐ |
| 附件上传 | ✅ TS | UI 有钩子未接线 | ⭐⭐⭐⭐ |
| Subagent 控制台 | ✅ TS | ❌ | ⭐⭐⭐⭐ |
| MCP 工具探索 | ✅ | ❌ | ⭐⭐⭐⭐ |
| Memory/Skills 管理 | ✅ | ❌ | ⭐⭐⭐ |
| SDK 完整 API | 部分 | runAgent + MCP only | ⭐⭐⭐⭐ |

---

## 5. 测试与文档

- **测试薄弱**：Python core 零测试；两端 backend 集成测试少；SDK/UI 几乎无测
- **文档**：yunfan 系列偏 TS；缺 TS↔Python parity 矩阵；部分 README 过时

---

## 6. 推荐实践路径（按学习深度排序）

### Path A — 流式 Agent 可观测性（全栈，TS）

1. 读 `events.ts` / `agent.ts` invokeStream
2. Web 接 SSE，展示 tool_start/end 事件
3. 扩展 SDK `runAgentStream`

**学到**：事件驱动编排、ReAct 中间态、SSE 协议设计

### Path B — Subagent 多 Agent 编排（Core 深水区）

1. 精读 `subagent.ts` planner/worker 模式
2. 手写一个「研究 + 写作」双 agent 场景
3. （可选）移植 skeleton 到 Python

**学到**：任务分解、并发、失败策略、supervisor 模式

### Path C — MCP 插件实战（你已有文档基础）

1. 手写 `.mjs` MCP 插件（对接真实 API）
2. Backend 直调 + Agent 自动选用
3. 加 MCP 探索 UI

**学到**：工具契约、动态加载、LLM tool calling

### Path D — 附件 RAG 管线（Backend + Tool）

1. 走读 TS `attachment.service.ts`
2. 实现「上传 → 解析 → chunk → search tool」
3. Agent 通过工具检索附件内容

**学到**：文档 ingest、分块、检索增强、异步队列

### Path E — 工具执行策略 + 安全边界

1. 读 `tool-execution.ts`
2. 加 allowlist、超时、并行策略到实际场景
3. 为危险工具加确认/沙箱

**学到**：Agent 安全、工具治理、可靠性

---

## 7. 建议的阶段性路线图（草案）

| 阶段 | 主题 | 子任务示例 | 预估难度 |
|------|------|------------|----------|
| Phase 1 | 看懂现有 Core | MCP 插件实战 或 流式事件走读 | 低–中 |
| Phase 2 | 打通一条全栈链路 | Web SSE + tool 事件展示 | 中 |
| Phase 3 | 进阶编排 | Subagent 场景 或 附件 RAG | 高 |
