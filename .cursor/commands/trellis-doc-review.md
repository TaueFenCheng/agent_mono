# Trellis Doc Review

对当前（或指定）任务方案做 **多角色 Agent 审查**（产品 / 开发 / 测试 / UX / 架构*），输出 `doc-review-report.md`。

## 执行步骤（主会话）

1. 加载 skill `trellis-doc-review`
2. 若无任务，提示 `task.py create` + `trellis-brainstorm`
3. **Dispatch** 子 Agent `trellis-doc-review`（协调者）；**禁止**主会话自行填写审查 CRITICAL
4. 存在 CRITICAL → dispatch `trellis-doc-fix`（`/trellis-fix-critical`）；修复后 **重新** `/trellis-doc-review`。在该审查链未闭环前 **不要** implement；未跑 doc-review 时可直接 implement

用法：`/trellis-doc-review` 或 `/trellis-doc-review <task-slug>`
