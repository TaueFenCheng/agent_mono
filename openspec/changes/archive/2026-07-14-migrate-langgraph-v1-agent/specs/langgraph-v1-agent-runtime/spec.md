## ADDED Requirements

### Requirement: 共享 Agent 执行使用受支持的 LangChain v1 工厂
TypeScript Agent Core MUST 在同步和流式 Agent 执行中使用受支持的 LangChain v1 Agent 工厂，并且 MUST 保留现有工具、系统提示词、checkpoint saver、图名称以及调用契约。

#### Scenario: 同步调用保留已配置的运行时
- **WHEN** Agent Core 收到带工具、系统上下文和可选 checkpoint saver 的同步调用
- **THEN** 它使用已配置的 model、工具、组合后的系统提示词和 checkpoint saver 构造并调用 LangChain v1 Agent，同时保持现有输入输出结构

#### Scenario: 流式调用保留工具和事件行为
- **WHEN** Agent Core 收到流式调用
- **THEN** 它构造 LangChain v1 Agent，并继续按当前约定发出运行、工具、推理、文本、错误和完成事件

#### Scenario: TypeScript Agent Core 不再使用旧工厂
- **WHEN** TypeScript Agent Core 被构建
- **THEN** 其运行时源码不包含已弃用的 `createReactAgent` 工厂的导入或调用
