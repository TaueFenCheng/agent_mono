# Trellis Doc Review

加载 `trellis-doc-review` skill，**dispatch** 协调子 Agent `trellis-doc-review`（多角色并行审查），输出 `doc-review-report.md`。

主会话禁止自行写 CRITICAL。有 CRITICAL 时 dispatch `trellis-doc-fix`，修复后重新 doc-review。未主动跑 doc-review 时可直接 implement。

用法：`/trellis:doc-review` 或带 `<task-slug>`
