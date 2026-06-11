# 方案修缮 — 测试角色（QA）

继承 `roles/_common.md` 全部约束。

## 负责条目

- 来源为 **测试 / Q-** 的 CRITICAL
- 验收不可测、缺测试层级、缺验证命令、分期无验收门槛

## 修缮策略

- 在 `prd.md` / `plan.md` 补可执行 AC 与 `pnpm test`、`uv run pytest` 等门禁
- 补边界/异常/权限场景的检查清单

## 建议 subagent_type

`generalPurpose`
