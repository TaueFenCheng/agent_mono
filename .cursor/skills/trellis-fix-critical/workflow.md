# Fix Critical Workflow — agent_mono

## 0. 隔离原则（强制）

| 角色 | 谁来做 | 禁止 |
| --- | --- | --- |
| 主会话 | **只 dispatch** `trellis-doc-fix` | 主会话按报告亲自改 PRD |
| `trellis-doc-fix` 协调 Agent | 分派角色修缮子 Agent + 写 `doc-fix-log.md` | 协调者代写方案正文 |
| 角色修缮子 Agent | 按 CRITICAL 改文档 + 勾选 report | 宣布审查通过、改源码 |
| 复审 | **再次** `trellis-doc-review` | fix 执行者自评通过 |

## 1. 前置

- `{task_dir}/doc-review-report.md` 存在未关闭 CRITICAL
- 可选：用户指定同时处理 HIGH

## 2. 主会话调度

**Agent type**: `trellis-doc-fix`（`.cursor/agents/trellis-doc-fix.md`）

Task 描述含 `TASK_DIR`、是否包含 HIGH。

## 3. 协调 Agent 内部分派

按报告将 CRITICAL 按角色归类，**仅**对有项的角色并行 `Task`（见 `roles/*.md`）。

## 4. 产出

- 更新后的方案文档 + `doc-review-report.md` 勾选
- `{task_dir}/doc-fix-log.md`

## 5. 门禁

- 仍有 `[ ]` CRITICAL → 阻塞 implement，继续 fix 或人工处理
- 全部 CRITICAL 已勾选 → **必须** dispatch `trellis-doc-review`（不得由 fix 链自评）
