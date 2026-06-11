# Trellis Fix Critical

加载 `trellis-fix-critical` skill，**dispatch** 协调子 Agent `trellis-doc-fix`（多角色并行修缮），产出 `doc-fix-log.md`。

主会话禁止自行批量改 PRD。完成后 **必须** 再 `/trellis:doc-review`（仅当任务已走 doc-review 链路）。

用法：`/trellis:fix-critical` 或带 `<task-slug>`
