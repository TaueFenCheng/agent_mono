## 背景

共享的 TypeScript Agent Core 在同步和流式路径中构造同一种 Agent 图。两条路径目前都引入了 LangGraph 已弃用的 `createReactAgent`，并传入旧版的 `llm` 和 `prompt` 参数。迁移必须保留工具注册、工具白名单和调用上下文、checkpoint 持久化、运行名称以及流事件处理。

## 目标 / 非目标

**目标：**

- 使用 `langchain` 包中的 `createAgent`，将 `llm` 映射为 `model`，将 `prompt` 映射为 `systemPrompt`。
- 只升级共享 TypeScript Agent Core 迁移所需的依赖。
- 保留现有 `AgentCore` 的公共输入、输出和事件契约。
- 增加迁移后的构造与执行回归测试。

**非目标：**

- 不重新设计 Agent prompt、工具注册表、记忆或 checkpoint 模型。
- 不迁移独立的 Python Agent 实现。
- 不修改前端 SSE 协议。

## 技术决策

- 使用 `langchain` 包中的 `createAgent`，而不是继续使用 `@langchain/langgraph/prebuilt`。这是官方推荐的 v1 迁移路径，并能保留现有 chat model 和工具列表。
- 继续在现有 `invoke` 和 `invokeStream` 方法中构造 Agent 图，不引入额外抽象，以减少迁移面并保持现有事件处理差异。
- 使用 workspace 包管理器同步升级依赖和 lockfile，避免新旧 API 的间接依赖混用。
- 除非编译或测试明确要求，否则保留现有 graph `name`、checkpoint saver 以及输入输出处理。

## 风险 / 权衡

- [API 不兼容] v1 工厂或升级后的 LangGraph 包可能改变图类型或流式行为 → 执行 Core 测试和 TypeScript 构建，只修复验证过程中实际发现的兼容性问题。
- [运行时要求] LangGraph v1 要求 Node.js 22+ → 如果项目存在对应运行时元数据，则补充版本要求，并在验证阶段报告环境不匹配。
- [行为漂移] Agent 事件名称或消息状态可能间接受到影响 → 保留现有事件断言，并为同步和流式模式增加 smoke test。

## 迁移计划

1. 升级依赖并重新生成 lockfile。
2. 替换两处图工厂调用，并调整参数名称。
3. 执行 Core 定向测试、workspace TypeScript 检查和 Core 构建。
4. 如果下游兼容性验证失败，则回退依赖和工厂调用变更；不需要数据迁移。

## 待确认问题

- CI 和部署镜像是否已经使用 Node.js 22 或更高版本，需要根据仓库配置和构建环境验证。
