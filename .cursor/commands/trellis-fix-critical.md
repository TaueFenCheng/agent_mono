# Trellis Fix Critical

根据 `doc-review-report.md` 由 **多角色修缮子 Agent** 更新方案文档（仅文档，不写业务源码）。

## 执行步骤（主会话）

1. 加载 skill `trellis-fix-critical`
2. **Dispatch** 子 Agent `trellis-doc-fix`（协调者）；**禁止**主会话自行批量改 PRD
3. 完成后 **必须** `/trellis-doc-review` 复审，或用户书面签字后再 implement（仅适用于已走 doc-review 链路的任务）

用法：`/trellis-fix-critical` 或 `/trellis-fix-critical <task-slug>`
