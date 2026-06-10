# 探讨项目待完善功能与 Agent 开发实践路径

## Goal

系统梳理 `intelligentAgent` monorepo 中尚未完善的功能点，并收敛出一份**适合深入实践 Agent 开发**的学习/实施路线图。本任务以**需求探讨与规划**为主，不急于写代码；产出物是可执行的优先级清单与后续子任务建议。

## What I already know

* 用户希望更深入实践 Agent 开发，而非仅阅读文档
* 项目已有较完整的 TS 参考栈：`agent-core-ts`（ReAct、流式、Subagent、MCP、工具策略）+ `agent-backend-ts`（JWT、BullMQ、附件解析）
* Python 栈在 HTTP 层面对齐，但 **core/runtime 明显落后**（`invoke_stream`、`invoke_subagents` 路由存在但 runtime 无对应方法）
* 前端 Web 仅覆盖同步对话 + 线程 + 模型设置；流式、附件、MCP、Subagent、Memory/Skills 管理均未接入
* 用户近期已阅读 MCP 走读文档（`docs/yunfan/2026-06-09-mcp-implementation-walkthrough.md`）和面试 Q&A，说明对 MCP、存储、Checkpoint 已有一定认知
* 测试覆盖集中在 TS core；Python core 零测试，两端 backend 集成测试薄弱

## Assumptions (temporary)

* 用户主要使用 TypeScript 栈进行学习和实践（待确认）
* 用户更关注「动手理解 Agent 原理」而非「补齐所有 parity」（待确认）
* 本任务产出为路线图 + 可选子任务拆分，而非单次大功能实现

## Open Questions

* **用户的学习重心**：偏 Core 原理 / 全栈打通 / 多 Agent 编排 / MCP 生态？（见本轮提问）

## Requirements (evolving)

* 产出项目功能缺口清单（按类别：Parity / Incomplete / Frontend / Testing / Docs）
* 为每项标注**实践价值**（1–5）与推荐起点文件
* 收敛出 3–5 条高优先级实践路径，可拆为后续 Trellis 子任务
* 明确本探讨任务的 Out of Scope（不直接实现功能）

## Acceptance Criteria (evolving)

* [ ] PRD 包含完整的功能缺口矩阵（TS vs Python vs Frontend）
* [ ] 用户确认学习重心与优先级偏好
* [ ] 产出分阶段实践路线图（Phase 1/2/3，每阶段 1–2 个可落地子任务）
* [ ] 用户确认路线图后可进入 `task.py start` 或拆分子任务

## Definition of Done

* 路线图文档写入 `research/project-gap-audit.md`（或 PRD 内嵌）
* 用户明确下一步要落地的 1 个具体子任务（或确认仅保留规划）

## Out of Scope (explicit)

* 本任务内不直接修改业务代码
* 不追求 TS/Python 完全 parity 的一次性补齐
* 不更新 `AGENT_CAPABILITIES.md`（除非用户明确要求）

## Technical Notes

### 架构现状摘要

| 层级 | TS 状态 | Python 状态 | 前端/SDK |
|------|---------|-------------|----------|
| Core | 完整：stream、subagent、tool policy、MCP helpers | 缺 stream/subagent；invoke 输入面较窄 | — |
| Backend | JWT、BullMQ、附件解析完整 | 路由存在但 core 未支撑；auth 未挂载 | — |
| Client | — | — | 同步 only；SDK 面窄 |

### 高实践价值缺口（初步，practice 4–5）

1. **Subagent 编排** — `core/agent-core-ts/ts/subagent.ts`；Python 完全缺失
2. **流式 + 工具事件** — `event-stream.ts` + Web SSE 接入
3. **附件 ingest → chunk → 检索** — TS 有完整链路，Python 仅 upload
4. **MCP 插件手写 + UI 探索器** — 用户已有 MCP 文档基础
5. **工具执行策略** — `tool-execution.ts` 超时/并行/allowlist

### 已知文档资产

* `docs/yunfan/2026-06-09-mcp-implementation-walkthrough.md` — MCP 走读（TS 向）
* `docs/interview/2026-06-09-agent-mcp-interview-qa.md`
* `docs/interview/2026-06-09-agent-storage-interview-qa.md`
* `AGENT_CAPABILITIES.zh-CN.md` — 能力清单（未标注 parity 缺口）

### 关键路径

* Core TS: `core/agent-core-ts/ts/agent.ts`, `subagent.ts`, `events.ts`, `mcp.ts`
* Core Py: `core/agent-core-python/agent_core/runtime.py`
* Backend: `backend/agent-backend-ts/`, `backend/agent-backend-python/app/routers/`
* Frontend: `packages/ui/src/components/agent-workspace.tsx`, `frontend/web/`

## Research References

* （待写入）`research/project-gap-audit.md` — 完整缺口审计
