---
name: trellis-doc-review
description: '方案/PRD 多角色 Agent 审查。权威步骤见 .cursor/skills/trellis-doc-review/。'
---

# Trellis Doc Review

完整步骤、角色定义与协调流程见：

- `.cursor/skills/trellis-doc-review/SKILL.md`
- `.cursor/skills/trellis-doc-review/workflow.md`
- `.cursor/agents/trellis-doc-review.md`
- `.cursor/skills/trellis-doc-review/roles/*.md`

触发：`/trellis:doc-review` 或加载本 skill。

**主会话只调度** `trellis-doc-review` 协调子 Agent；审查由产品/开发/测试/UX（及跨层时架构）子 Agent 并行完成。
