export type Role = "system" | "user" | "assistant" | "tool";

export type Provider = "openai" | "anthropic" | "gemini" | "qwen" | "glm" | "deepseek";

export interface ChatMessage {
  role: Role;
  content: string;
  createdAt: string;
}

export interface AgentRunRequest {
  threadId?: string;
  sessionId?: string;
  userId?: string;
  messages: ChatMessage[];
  model?: string;
  provider?: Provider;
  metadata?: Record<string, unknown>;
  enabledSkills?: string[];
}

export type SubagentRole = "planner" | "researcher" | "coder";

export type SubagentStatus = "pending" | "running" | "succeeded" | "failed" | "timed_out";

export interface SubagentTask {
  taskId?: string;
  role: SubagentRole;
  prompt: string;
  provider?: Provider;
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

export interface SubagentRunRequest {
  threadId?: string;
  sessionId?: string;
  userId?: string;
  prompt?: string;
  tasks?: SubagentTask[];
  provider?: Provider;
  model?: string;
  metadata?: Record<string, unknown>;
  enabledSkills?: string[];
  maxConcurrency?: number;
  taskTimeoutMs?: number;
  roleModelOverrides?: Partial<Record<SubagentRole, { provider?: Provider; model?: string }>>;
}

export interface SubagentRunResponse {
  runId: string;
  threadId: string;
  createdAt: string;
  partial: boolean;
  summary: string;
  tasks: SubagentTask[];
  results: SubagentResult[];
  succeededTasks: SubagentResult[];
  failedTasks: SubagentResult[];
}

export interface AgentRunResponse {
  runId: string;
  threadId: string;
  output: string;
  provider: string;
  createdAt: string;
  cached?: boolean;
  checkpointId?: string | null;
  toolCount?: number;
}

export interface RunRecordResponse {
  runId: string;
  threadId: string;
  prompt: string;
  output: string;
  provider: string;
  model?: string | null;
  checkpointId?: string | null;
  createdAt: string;
}

export interface SubagentRunRecordResponse {
  runId: string;
  threadId: string;
  prompt?: string | null;
  summary: string;
  partial: boolean;
  createdAt: string;
  results: SubagentResult[];
}

export interface ThreadSummaryResponse {
  thread_id: string;
  created_at?: string | null;
  updated_at?: string | null;
  latest_checkpoint_id?: string | null;
  title?: string | null;
}

export interface ThreadListResponse {
  thread_list: ThreadSummaryResponse[];
}

export interface ThreadCheckpointResponse {
  checkpoint_id?: string | null;
  parent_checkpoint_id?: string | null;
  ts?: string | null;
  metadata?: Record<string, unknown>;
  values: Record<string, unknown>;
  pending_writes: Array<Record<string, unknown>>;
}

export interface ThreadDetailResponse {
  thread_id: string;
  checkpoints: ThreadCheckpointResponse[];
}

export interface MemoryFactResponse {
  id: string;
  thread_id: string;
  content: string;
  category: string;
  confidence: number;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface CreateMemoryFactRequest {
  content: string;
  category?: string;
  confidence?: number;
  metadata?: Record<string, unknown>;
}

export interface ThreadMemoryResponse {
  thread_id: string;
  facts: MemoryFactResponse[];
}

export interface SkillResponse {
  name: string;
  description: string;
  path: string;
  metadata: Record<string, unknown>;
  content?: string | null;
}

export interface SkillListResponse {
  skills: SkillResponse[];
}

export interface McpPluginInfo {
  name: string;
}

export interface McpPluginListResponse {
  plugins: McpPluginInfo[];
}

export interface McpToolInfo {
  plugin: string;
  name: string;
  description: string;
}

export interface McpToolListResponse {
  tools: McpToolInfo[];
}

export interface InvokeMcpToolRequest {
  arguments?: unknown;
  threadId?: string;
  runId?: string;
  metadata?: Record<string, unknown>;
}

export interface InvokeMcpToolResponse {
  plugin: string;
  toolName: string;
  output: unknown;
}

export interface HealthResponse {
  status: "ok";
  postgres: "up" | "down";
  redis: "up" | "down";
  checkpointer?: "memory" | "postgres";
  at: string;
}
