## ADDED Requirements

### Requirement: Core SHALL provide an injectable Agent Runtime

`core/agent-core-ts` SHALL expose a Runtime factory and Runtime type that can construct and manage an `AgentCore` using abstract dependencies, without importing Prisma, NestJS, Redis, or backend execution implementations.

#### Scenario: Construct runtime with backend-provided dependencies

- **WHEN** a caller provides a tool registry, memory store, skill registry, checkpoint saver, and optional close callback
- **THEN** the Core factory returns a Runtime whose Agent operations use those exact dependencies

#### Scenario: Construct runtime without optional infrastructure

- **WHEN** a caller omits optional memory, checkpointer, or close dependencies
- **THEN** the Runtime remains constructible and its `close()` operation completes successfully

### Requirement: Core Runtime SHALL preserve Agent operation coverage

The Core Runtime SHALL expose or delegate synchronous invocation, streaming invocation, subagent invocation, thread access, Skill access, memory access, and MCP operations currently provided by `AgentCore`.

#### Scenario: Invoke through Runtime

- **WHEN** a caller invokes the Runtime with an `AgentInvokeInput`
- **THEN** the Runtime returns the same `AgentInvokeOutput` semantics as `AgentCore.invoke`

#### Scenario: Stream through Runtime

- **WHEN** a caller requests a streaming invocation
- **THEN** the Runtime yields the same `AgentRunEvent` sequence as `AgentCore.invokeStream`

### Requirement: Backend SHALL retain infrastructure-specific composition

The backend runtime SHALL remain responsible for Prisma-backed memory, active model configuration lookup, checkpointer connection configuration, host execution tools, and sandbox tools, and SHALL inject them into the Core Runtime.

#### Scenario: Backend creates runtime with Prisma

- **WHEN** backend initializes the Agent Runtime with a Prisma client
- **THEN** Prisma and sandbox dependencies are adapted in backend and the Core package receives only abstract interfaces

#### Scenario: Existing backend callers use runtime facade

- **WHEN** Controllers, queue processors, or subagent services call existing runtime facade functions
- **THEN** their public behavior and returned event/output shapes remain unchanged

### Requirement: Runtime SHALL support explicit shutdown

The Runtime SHALL expose an idempotent asynchronous `close()` operation so the backend can release checkpointer and other runtime resources during application shutdown.

#### Scenario: Shutdown runtime twice

- **WHEN** the backend calls `close()` more than once
- **THEN** subsequent calls complete without throwing due solely to prior shutdown
