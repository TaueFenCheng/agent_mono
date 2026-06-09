---
name: trellis-fix-critical
description: '根据 doc-review-report 由 trellis-doc-fix 协调多角色子 Agent 修缮方案文档。只改文档不写代码。仅在已执行 doc-review 且存在未关闭 CRITICAL 时走。'
---

# Trellis Fix Critical（agent_mono）

根据 **`doc-review-report.md`** 中的 CRITICAL（及用户指定的 HIGH），通过 **`trellis-doc-fix` 协调子 Agent** 分角色修缮方案文档。

## 主会话职责（强制）

1. 解析 `TASK_DIR`
2. **Dispatch** 协调子 Agent：`trellis-doc-fix`（`.cursor/agents/trellis-doc-fix.md`）
3. 展示 `doc-fix-log.md` 摘要；提示 **必须** 重新 `/trellis-doc-review`
4. **禁止**在主会话中自行批量修改 PRD 并勾选 report

> 若无法 `Task(subagent_type="trellis-doc-fix")`，则严格扮演协调者：仅通过 `Task` 调度各 `roles/*.md` 修缮子 Agent，再写 `doc-fix-log.md`。

## 触发条件

- `/trellis-fix-critical` 或带 `<task-slug>`
- `trellis-doc-review` 结论为「需 fix-critical」
- 用户要求按审查意见改 PRD/四件套

## 可修改文件（角色子 Agent）

| 文件 | 说明 |
| --- | --- |
| `{task}/prd.md` | 需求、验收、Technical Approach |
| `{task}/info.md` | 技术补充 |
| `{task}/research/*.md` | 调研 |
| `{task}/doc-review-report.md` | 勾选本角色已修项 |
| `docs/implementation/<slug>/*` | 四件套 |
| `{task}/doc-fix-log.md` | 协调者汇总日志 |

**禁止**：`core/**`、`backend/**`、`frontend/**`、`packages/**` 业务源码；擅自 `git commit`。

## 修缮角色

见 `roles/{product,development,qa,ux,architecture}.md` 与 `roles/_common.md`。

## 流程

1. dispatch **`trellis-doc-fix`**
2. 协调者按角色并行修缮子 Agent
3. 产出 **`doc-fix-log.md`**
4. **必须**重新 dispatch **`trellis-doc-review`**，或用户书面签字豁免

## 与审查链关系

```
trellis-doc-review → [CRITICAL] → trellis-doc-fix → trellis-doc-review → implement
```

Cursor: `/trellis-fix-critical`  
Claude: `/trellis:fix-critical`
