## 1. Core Runtime 抽象

- [x] 1.1 新增 Core Runtime 类型，定义可注入的工具、MemoryStore、SkillRegistry、checkpointer 和关闭回调依赖。
- [x] 1.2 实现 Core Runtime 工厂和 AgentCore 委托方法，覆盖同步、流式、子 Agent、线程、Skill、Memory 和 MCP 能力。
- [x] 1.3 导出 Runtime 类型与工厂，并补充 Core 单元测试验证依赖注入、调用委托和幂等关闭。

## 2. Backend 适配迁移

- [x] 2.1 调整 backend runtime 初始化逻辑，通过 Core Runtime 工厂组装现有 Prisma、checkpointer、Host/Sandbox 工具和 MCP 依赖。
- [x] 2.2 保留现有 backend runtime facade，确保 active model config 查询、请求参数归一化和现有调用方行为不变。
- [x] 2.3 调整 runtime 的 shutdown 和进程级缓存逻辑，确保重复关闭安全且不改变现有应用生命周期行为。

## 3. 验证与文档

- [x] 3.1 运行 Core 与 backend TypeScript 类型检查、测试和构建，修复迁移引入的问题。（Core 测试与两端构建已通过；backend 有 2 个与本次变更无关的 RAG 测试失败）
- [x] 3.2 检查 Core 产物依赖，确认不引入 Prisma、NestJS、Redis 或 backend 相对路径依赖。
- [x] 3.3 更新相关架构说明，记录 Core Runtime 与 backend composition layer 的职责边界。
