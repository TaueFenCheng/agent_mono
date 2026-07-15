import { AgentCore } from "./agent";
import type {
  AgentCoreOptions,
  AgentInvokeInput,
  AgentInvokeOutput,
  AgentToolRegistry,
  MemoryFact,
  MemoryStore,
  McpPluginInfo,
  McpToolInfo,
  Skill,
  SkillRegistryLike,
  SubagentRunInput,
  SubagentRunOutput,
  ThreadDetail,
  ThreadSummary
} from "./types";
import type { AgentRunEvent } from "./events";
import type { BaseCheckpointSaver } from "@langchain/langgraph";

export interface AgentRuntimeDependencies {
  toolRegistry?: AgentToolRegistry;
  memoryStore?: MemoryStore;
  skillRegistry?: SkillRegistryLike;
  checkpointSaver?: BaseCheckpointSaver;
  mcpServices?: Record<string, unknown>;
  close?: () => Promise<void>;
}

/**
 * Reusable runtime facade for AgentCore.
 *
 * Infrastructure implementations (Prisma, Redis, sandbox backends, etc.)
 * are supplied by the host application through AgentRuntimeDependencies.
 */
export interface AgentRuntime {
  readonly core: AgentCore;
  readonly invoke: (input: AgentInvokeInput) => Promise<AgentInvokeOutput>;
  readonly invokeStream: (input: AgentInvokeInput) => AsyncGenerator<AgentRunEvent, AgentInvokeOutput, void>;
  readonly invokeSubagents: (input: SubagentRunInput) => Promise<SubagentRunOutput>;
  readonly invokeSubagentsStream: (input: SubagentRunInput) => AsyncGenerator<AgentRunEvent, SubagentRunOutput, void>;
  readonly listThreads: (limit?: number) => Promise<ThreadSummary[]>;
  readonly getThread: (threadId: string) => Promise<ThreadDetail>;
  readonly listSkills: (options?: { enabledOnly?: boolean; enabledNames?: string[] }) => Skill[];
  readonly getSkill: (name: string) => Skill | null;
  readonly listMemoryFacts: (threadId: string, limit?: number) => Promise<MemoryFact[]>;
  readonly createMemoryFact: AgentCore["createMemoryFact"];
  readonly deleteMemoryFact: AgentCore["deleteMemoryFact"];
  readonly listMcpPlugins: () => McpPluginInfo[];
  readonly listMcpTools: (input?: {
    threadId?: string;
    runId?: string;
    metadata?: Record<string, unknown>;
  }) => Promise<McpToolInfo[]>;
  readonly invokeMcpTool: AgentCore["invokeMcpTool"];
  readonly close: () => Promise<void>;
}

export function createAgentRuntime(
  dependencies: AgentRuntimeDependencies = {},
  options: AgentCoreOptions = {}
): AgentRuntime {
  const core = new AgentCore({
    ...options,
    toolRegistry: dependencies.toolRegistry ?? options.toolRegistry,
    memoryStore: dependencies.memoryStore ?? options.memoryStore,
    skillRegistry: dependencies.skillRegistry ?? options.skillRegistry,
    checkpointSaver: dependencies.checkpointSaver ?? options.checkpointSaver,
    mcpServices: dependencies.mcpServices ?? options.mcpServices
  });

  let closed = false;
  const close = async (): Promise<void> => {
    if (closed) return;
    closed = true;
    await dependencies.close?.();
  };

  return {
    core,
    invoke: (input) => core.invoke(input),
    invokeStream: (input) => core.invokeStream(input),
    invokeSubagents: (input) => core.invokeSubagents(input),
    invokeSubagentsStream: (input) => core.invokeSubagentsStream(input),
    listThreads: (limit) => core.listThreads(limit),
    getThread: (threadId) => core.getThread(threadId),
    listSkills: (listOptions) => core.listSkills(listOptions),
    getSkill: (name) => core.getSkill(name),
    listMemoryFacts: (threadId, limit) => core.listMemoryFacts(threadId, limit),
    createMemoryFact: (threadId, input) => core.createMemoryFact(threadId, input),
    deleteMemoryFact: (threadId, factId) => core.deleteMemoryFact(threadId, factId),
    listMcpPlugins: () => core.listMcpPlugins(),
    listMcpTools: (input) => core.listMcpTools(input),
    invokeMcpTool: (input) => core.invokeMcpTool(input),
    close
  };
}
