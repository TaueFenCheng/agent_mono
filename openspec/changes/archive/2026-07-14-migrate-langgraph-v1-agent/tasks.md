## 1. 依赖与 API 迁移

- [x] 1.1 将 TypeScript Agent Core 的 LangChain/LangGraph 依赖升级到兼容 LangChain v1 的版本，并重新生成 `pnpm-lock.yaml`。
- [x] 1.2 将两处 `createReactAgent` 构造调用替换为 `createAgent`，调整 model 和 system prompt 参数，同时保持工具、checkpoint、名称和调用行为不变。

## 2. 验证与文档

- [x] 2.1 增加或更新定向测试，覆盖工厂迁移后的同步和流式 Agent 执行。
- [x] 2.2 执行 Agent Core 测试、TypeScript 构建/类型检查和仓库验证；在不改变公共契约的前提下修复兼容性回归。
- [x] 2.3 在合适的项目元数据或文档中记录 Node.js 22+ 运行时要求，并验证 OpenSpec 变更。
