---
name: trellis-doc-review
description: '方案/PRD 多角色 Agent 审查（按需、编码前）。由 trellis-doc-review 协调子 Agent（产品/开发/测试/UX/架构）产出 doc-review-report.md。非 brainstorm 后必经步骤。'
---

# Trellis Doc Review（agent_mono）

在 **`trellis-brainstorm` 完成且用户确认需求后**、**`trellis-implement` 之前**，通过 **多角色子 Agent** 审查方案并产出分级问题清单。

## 主会话职责（强制）

你是 **调度者**，不是审查者：

1. 解析 `TASK_DIR`（`.trellis/.current-task` 或 `<task-slug>`）
2. **Dispatch** 协调子 Agent：`trellis-doc-review`（见 `.cursor/agents/trellis-doc-review.md`）
3. 向用户展示报告摘要；存在 CRITICAL → dispatch `trellis-doc-fix`（`/trellis-fix-critical`）
4. **禁止**在主会话中自行通读 PRD 并写入 `doc-review-report.md` 的 CRITICAL/HIGH

> 若平台无法 `Task(subagent_type="trellis-doc-review")`，则加载本 skill 的 `workflow.md`，由当前 Agent **严格扮演协调者**：仅通过 `Task` 调度各 `roles/*.md` 角色子 Agent，再汇总报告。

## 触发条件

- `/trellis-doc-review` 或 `/trellis-doc-review <task-slug>`
- 用户明确要求审查方案 / PRD
- `workflow.md` Phase **1.4**（可选步骤）

**非默认**：brainstorm 完成并确认 PRD 后**不自动**进入本 skill；直接进入实现除非用户选择审查。

**建议主动触发**（仍可选）：跨 2+ 包/层（core / backend / frontend）、新 API、DB 或架构变更、多阶段 PR、需四件套。

## 审查角色

| 角色 | 文件 | 关注点 |
| --- | --- | --- |
| 产品 | `roles/product.md` | 需求、范围、验收、用户价值 |
| 开发 | `roles/development.md` | 技术方案、契约、spec、可行性 |
| 测试 | `roles/qa.md` | 可测性、AC、测试策略、门禁 |
| UX | `roles/ux.md` | 流程、状态、体验、a11y |
| 架构* | `roles/architecture.md` | 跨层一致性、架构传承 |

\* 跨包/跨层或四件套任务启用。

## 审查对象（子 Agent 按存在性读取）

| 文件 | 路径 |
| --- | --- |
| PRD | `.trellis/tasks/<task>/prd.md` |
| 技术说明 | `info.md`、`research/*.md` |
| 四件套 | `docs/implementation/<slug>/{spec,design,api-interface,plan}.md` |
| 架构/学习文档 | `docs/yunfan/**/*.md`、`CLAUDE.md` |

## 严重级别

| 级别 | 行动 |
| --- | --- |
| CRITICAL | 必须 dispatch `trellis-doc-fix`，然后 **重新 dispatch doc-review** |
| HIGH | 应修复，主会话 WARN |
| MEDIUM / LOW | 记录 |

## 输出

`{TASK_DIR}/doc-review-report.md`（格式见 `report-template.md`）。

## 审查后

1. 展示 CRITICAL/HIGH 摘要
2. 有 CRITICAL → dispatch `trellis-doc-fix`，**不要**写业务代码
3. 修复后 **重新** dispatch `trellis-doc-review`（新子 Agent 轮次），或用户书面签字豁免

Cursor: `/trellis-doc-review`  
Claude: `/trellis:doc-review`
