# Doc Review — {task-slug}

> 由 `trellis-doc-review` 协调子 Agent 多角色审查后汇总。主会话/PRD 作者不得替代本报告中的 CRITICAL 判定。

## 元信息

| 项 | 值 |
| --- | --- |
| 任务目录 | `.trellis/tasks/<slug>/` |
| 审查时间 | {ISO8601} |
| 协调方式 | 子 Agent 并行（产品 / 开发 / 测试 / UX / 架构*） |

\* 架构角色仅跨包/跨层复杂任务启用。

## 角色评分摘要

| 角色 | 评分 | CRITICAL | HIGH |
| --- | ---: | ---: | ---: |
| 产品 | | | |
| 开发 | | | |
| 测试 | | | |
| 用户体验 | | | |
| 架构 | | | |

## 分角色详情

{粘贴各角色 Agent 的完整输出章节}

## 汇总 CRITICAL（全局编号）

- [ ] C1: <来源角色 P/D/Q/U/A> — <问题> — <建议>

## 汇总 HIGH

- [ ] H1: ...

## MEDIUM / LOW

- ...

## 审查结论

- [ ] 可进入 implement（无未解决 CRITICAL）
- [ ] 需 dispatch `trellis-doc-fix` 后再审

## 复审记录（fix-critical 后填写）

| 轮次 | 日期 | 未关闭 CRITICAL |
| --- | --- | --- |
