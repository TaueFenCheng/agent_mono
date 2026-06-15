import type { BaseMessage, BaseMessageLike } from "@langchain/core/messages";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { BaseCheckpointSaver } from "@langchain/langgraph";
import type { StructuredToolInterface } from "@langchain/core/tools";
import { z } from "zod";

export type CoreProvider = "qwen" | "glm" | "openai" | "anthropic" | "gemini" | "deepseek";
export type SubagentRole = "planner" | "researcher" | "coder";
export type SubagentFailurePolicy = "continue_on_error" | "fail_fast";
export type SubagentStatus = "pending" | "running" | "succeeded" | "failed" | "timed_out";

export interface ProviderRuntimeConfig {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  temperature?: number;
}

export interface ProviderRouteConfig {
  apiKeyEnv: string;
  apiKeyEnvAliases?: string[];
  baseUrlEnv: string;
  modelEnv: string;
  defaultBaseUrl: string;
  defaultModel: string;
  aliases?: string[];
  temperatureEnv?: string;
  defaultTemperature?: number;
}

export interface CreateRoutedModelInput {
  provider?: string;
  model?: string;
  temperature?: number;
  defaultModel?: string;
  env?: Record<string, string | undefined>;
  providerConfig?: ProviderRuntimeConfig;
  providerConfigs?: Record<string, ProviderRuntimeConfig>;
}

export interface RoutedModelResult {
  provider: string;
  model: string;
  baseUrl: string;
  temperature: number;
  chatModel: BaseChatModel;
}

export interface AgentInvokeInput {
  prompt: string;
  threadId: string;
  systemContext?: string;
  provider?: string;
  model?: string;
  metadata?: Record<string, unknown>;
  enabledSkills?: string[];
  runId?: string;
  messages?: BaseMessageLike[];
  toolAllowlist?: string[];
  providerConfigs?: Record<string, ProviderRuntimeConfig>;
}

export interface AgentInvokeOutput {
  output: string;
  provider: string;
  messages: BaseMessage[];
  toolCount: number;
  checkpointId?: string | null;
  threadId: string;
}

export interface SubagentTask {
  taskId?: string;
  role: SubagentRole;
  prompt: string;
  provider?: CoreProvider;
  model?: string;
  metadata?: Record<string, unknown>;
}

export interface SubagentResult {
  taskId: string;
  role: SubagentRole;
  status: SubagentStatus;
  threadId: string;
  provider?: string | null;
  model?: string | null;
  output?: string | null;
  error?: string | null;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  checkpointId?: string | null;
}

export interface SubagentRunInput {
  threadId: string;
  runId?: string;
  prompt?: string;
  tasks?: SubagentTask[];
  provider?: string;
  model?: string;
  metadata?: Record<string, unknown>;
  enabledSkills?: string[];
  maxConcurrency?: number;
  taskTimeoutMs?: number;
  roleModelOverrides?: Partial<Record<SubagentRole, { provider?: string; model?: string }>>;
}

export interface SubagentRunOutput {
  runId: string;
  threadId: string;
  partial: boolean;
  summary: string;
  tasks: SubagentTask[];
  results: SubagentResult[];
  succeededTasks: SubagentResult[];
  failedTasks: SubagentResult[];
  createdAt: string;
}

export interface ToolInvocationContext {
  threadId?: string;
  runId?: string;
  metadata?: Record<string, unknown>;
}

export type McpServiceMap = Record<string, unknown>;

export interface McpToolPluginLoadContext {
  invocationContext: ToolInvocationContext;
  services?: McpServiceMap;
}

export interface McpPluginInfo {
  name: string;
}

export interface McpToolInfo {
  plugin: string;
  name: string;
  description: string;
}

export interface Skill {
  name: string;
  description: string;
  content: string;
  path: string;
  metadata: Record<string, unknown>;
}

export interface MemoryFact {
  id: string;
  threadId: string;
  content: string;
  category: string;
  confidence: number;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface ThreadSummary {
  thread_id: string;
  created_at?: string | null;
  updated_at?: string | null;
  latest_checkpoint_id?: string | null;
  title?: string | null;
}

export interface ThreadCheckpoint {
  checkpoint_id?: string | null;
  parent_checkpoint_id?: string | null;
  ts?: string | null;
  metadata?: Record<string, unknown>;
  values: Record<string, unknown>;
  pending_writes: Array<Record<string, unknown>>;
}

export interface ThreadDetail {
  thread_id: string;
  checkpoints: ThreadCheckpoint[];
}

export interface LocalToolSpec<TSchema extends z.ZodTypeAny = z.ZodTypeAny> {
  name: string;
  description: string;
  schema: TSchema;
  executionMode?: ToolExecutionMode;
  timeoutMs?: number;
  prepareArguments?: (input: unknown, context: ToolInvocationContext) => z.infer<TSchema>;
  invoke: (input: z.infer<TSchema>, context: ToolInvocationContext) => Promise<unknown> | unknown;
}

export interface McpToolPlugin {
  name: string;
  loadTools: (context?: McpToolPluginLoadContext) => Promise<StructuredToolInterface[]>;
}

export interface AgentCoreOptions {
  systemPrompt?: string;
  defaultProvider?: string;
  defaultModel?: string;
  providerConfigs?: Record<string, ProviderRuntimeConfig>;
  env?: Record<string, string | undefined>;
  subagent?: {
    maxConcurrency?: number;
    taskTimeoutMs?: number;
    maxTasksPerRun?: number;
    failurePolicy?: SubagentFailurePolicy;
    roleModelOverrides?: Partial<Record<SubagentRole, { provider?: string; model?: string }>>;
    roleToolAllowlist?: Partial<Record<SubagentRole, string[]>>;
  };
  toolRegistry?: AgentToolRegistry;
  checkpointSaver?: BaseCheckpointSaver;
  memoryStore?: MemoryStore;
  skillRegistry?: SkillRegistryLike;
  toolExecutionPolicy?: ToolExecutionPolicy;
  mcpServices?: McpServiceMap;
}

export type ToolExecutionMode = "parallel" | "sequential";

export interface ToolExecutionPolicy {
  mode?: ToolExecutionMode;
  timeoutMs?: number;
}

export type AgentToolEvent =
  | {
      type: "tool_start";
      toolName: string;
      input: unknown;
      threadId?: string;
    }
  | {
      type: "tool_end";
      toolName: string;
      input: unknown;
      output: unknown;
      durationMs: number;
      threadId?: string;
    }
  | {
      type: "tool_error";
      toolName: string;
      input: unknown;
      error: string;
      durationMs: number;
      threadId?: string;
    };

export interface BuildToolOptions {
  threadId?: string;
  runId?: string;
  metadata?: Record<string, unknown>;
  enabledSkills?: string[];
  memoryStore?: MemoryStore;
  skillRegistry?: SkillRegistryLike;
  executionPolicy?: ToolExecutionPolicy;
  onToolEvent?: (event: AgentToolEvent) => void | Promise<void>;
  mcpServices?: McpServiceMap;
  toolAllowlist?: string[];
}

export interface AgentToolRegistry {
  registerLocalTool<TSchema extends z.ZodTypeAny>(spec: LocalToolSpec<TSchema>): this;
  registerStructuredTool(tool: StructuredToolInterface): this;
  useMcpPlugin(plugin: McpToolPlugin): this;
  buildTools(options?: BuildToolOptions): Promise<StructuredToolInterface[]>;
  listMcpPlugins?(): McpPluginInfo[];
  buildMcpTools?(context?: McpToolPluginLoadContext): Promise<Array<{ plugin: string; tool: StructuredToolInterface }>>;
}

export interface MemoryStore {
  setup?(): Promise<void>;
  listFacts(threadId: string, options?: { limit?: number }): Promise<MemoryFact[]>;
  createFact(
    threadId: string,
    input: {
      content: string;
      category?: string;
      confidence?: number;
      metadata?: Record<string, unknown>;
    }
  ): Promise<MemoryFact>;
  deleteFact(threadId: string, factId: string): Promise<boolean>;
  renderPromptContext(threadId: string, options?: { limit?: number }): Promise<string>;
}

export interface SkillRegistryLike {
  listSkills(options?: { enabledOnly?: boolean; enabledNames?: string[] }): Skill[];
  getSkill(name: string): Skill | null;
  renderPromptContext(options?: { enabledNames?: string[] }): string;
}
