---
name: trellis-fix-critical
description: '方案 CRITICAL 修缮。权威步骤见 .cursor/skills/trellis-fix-critical/。'
---

# Trellis Fix Critical

完整步骤见：

- `.cursor/skills/trellis-fix-critical/SKILL.md`
- `.cursor/skills/trellis-fix-critical/workflow.md`
- `.cursor/agents/trellis-doc-fix.md`
- `.cursor/skills/trellis-fix-critical/roles/*.md`

触发：`/trellis:fix-critical`

**主会话只 dispatch** `trellis-doc-fix`；修缮由产品/开发/测试/UX/架构子 Agent 完成。完成后 **必须** 再 dispatch `trellis-doc-review`（仅当已执行 doc-review 且存在 CRITICAL）。
