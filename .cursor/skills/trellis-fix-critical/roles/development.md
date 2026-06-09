# 方案修缮 — 开发角色（Development）

继承 `roles/_common.md` 全部约束。

## 负责条目

- 来源为 **开发 / D-** 的 CRITICAL
- API/类型未定义、包归属错误、与 `.trellis/spec/**` 冲突、实施顺序不清

## 修缮策略

- 在 PRD / `plan.md` 注明路径、PR 顺序、命令门禁（`pnpm test`、`make build-ts` 等）
- 补 `api-interface.md`、数据流；修正 core / backend / frontend / packages 归属

## 建议 subagent_type

`trellis-research` 或 `generalPurpose`
