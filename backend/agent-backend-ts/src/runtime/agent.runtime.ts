import type { PrismaClient } from "@prisma/client";
import {
  AgentCore,
  type AgentRunEvent,
  DefaultAgentToolRegistry,
  type CheckpointerManager,
  type MemoryFact,
  type McpPluginInfo,
  type McpToolInfo,
  type Skill,
  type ThreadDetail,
  type ThreadSummary,
  type SubagentRunInput,
  type SubagentRunOutput,
  SkillRegistry,
  createCheckpointerManager,
  loadMcpPluginsFromEnv,
  registerBuiltinTools
} from "@tang-agent/agent-core";
import { PrismaMemoryStore } from "../infra/prisma-memory.store.js";

export interface AgentRuntime {
  core: AgentCore;
  checkpointerKind: "memory" | "postgres";
  close(): Promise<void>;
}

async function createCore(prisma: PrismaClient): Promise<AgentRuntime> {
  const memoryStore = new PrismaMemoryStore(prisma);
  await memoryStore.setup();

  const registry = registerBuiltinTools(new DefaultAgentToolRegistry());
  const skillRegistry = new SkillRegistry();

  const mcpPlugins = await loadMcpPluginsFromEnv();
  for (const plugin of mcpPlugins) {
    registry.useMcpPlugin(plugin);
  }

  let checkpointerManager: CheckpointerManager;
  try {
    checkpointerManager = await createCheckpointerManager({
      backend: process.env.AGENT_CHECKPOINTER_BACKEND ?? "postgres",
      connectionString:
        process.env.POSTGRES_URL ??
        `postgresql://${process.env.POSTGRES_USER ?? "tang"}:${process.env.POSTGRES_PASSWORD ?? "tang"}@${process.env.POSTGRES_HOST ?? "127.0.0.1"}:${process.env.POSTGRES_PORT ?? "5432"}/${process.env.POSTGRES_DB ?? "tang_agent"}`
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(`[agent-runtime] postgres checkpointer init failed, fallback to memory: ${reason}`);
    checkpointerManager = await createCheckpointerManager({ backend: "memory" });
  }

  return {
    core: new AgentCore({
      toolRegistry: registry,
      memoryStore,
      skillRegistry,
      checkpointSaver: checkpointerManager.saver,
      mcpServices: {
        prisma
      },
      defaultProvider: process.env.AGENT_PROVIDER ?? "qwen",
      systemPrompt:
        process.env.AGENT_SYSTEM_PROMPT ??
        "You are a pragmatic software engineering agent. Use tools when needed and keep answers concrete.",
      subagent: {
        maxConcurrency: Number(process.env.AGENT_SUBAGENT_MAX_CONCURRENCY ?? "2"),
        taskTimeoutMs: Number(process.env.AGENT_SUBAGENT_TASK_TIMEOUT_MS ?? "60000"),
        maxTasksPerRun: Number(process.env.AGENT_SUBAGENT_MAX_TASKS ?? "8"),
        failurePolicy: process.env.AGENT_SUBAGENT_FAILURE_POLICY === "fail_fast" ? "fail_fast" : "continue_on_error",
        roleModelOverrides: {
          planner: {
            provider: process.env.AGENT_SUBAGENT_PLANNER_PROVIDER,
            model: process.env.AGENT_SUBAGENT_PLANNER_MODEL
          },
          researcher: {
            provider: process.env.AGENT_SUBAGENT_RESEARCHER_PROVIDER,
            model: process.env.AGENT_SUBAGENT_RESEARCHER_MODEL
          },
          coder: {
            provider: process.env.AGENT_SUBAGENT_CODER_PROVIDER,
            model: process.env.AGENT_SUBAGENT_CODER_MODEL
          }
        },
        roleToolAllowlist: {
          planner: ["list_skills", "read_skill", "echo_text", "get_time"],
          researcher: ["list_skills", "read_skill", "list_memory", "get_time", "echo_text"],
          coder: ["list_skills", "read_skill", "remember_fact", "list_memory", "calculate", "echo_text", "get_time"]
        }
      }
    }),
    checkpointerKind: checkpointerManager.kind,
    close: async () => {
      await checkpointerManager.close();
    }
  };
}

let runtimeInitPromise: Promise<AgentRuntime> | null = null;

export async function getAgentRuntime(prisma: PrismaClient): Promise<AgentRuntime> {
  if (!runtimeInitPromise) {
    runtimeInitPromise = createCore(prisma);
  }
  return runtimeInitPromise;
}

export async function shutdownAgentRuntime(): Promise<void> {
  if (!runtimeInitPromise) return;
  const runtime = await runtimeInitPromise;
  await runtime.close();
  runtimeInitPromise = null;
}

export async function invokeAgent(input: {
  prompt: string;
  threadId: string;
  provider?: string;
  model?: string;
  metadata?: Record<string, unknown>;
  enabledSkills?: string[];
  runId?: string;
  prisma: PrismaClient;
}) {
  const runtime = await getAgentRuntime(input.prisma);
  return runtime.core.invoke({
    prompt: input.prompt,
    threadId: input.threadId,
    provider: input.provider,
    model: input.model,
    metadata: input.metadata,
    enabledSkills: input.enabledSkills,
    runId: input.runId
  });
}

export async function* invokeAgentStream(input: {
  prompt: string;
  threadId: string;
  provider?: string;
  model?: string;
  metadata?: Record<string, unknown>;
  enabledSkills?: string[];
  runId?: string;
  prisma: PrismaClient;
}): AsyncGenerator<AgentRunEvent> {
  const runtime = await getAgentRuntime(input.prisma);
  for await (const event of runtime.core.invokeStream({
    prompt: input.prompt,
    threadId: input.threadId,
    provider: input.provider,
    model: input.model,
    metadata: input.metadata,
    enabledSkills: input.enabledSkills,
    runId: input.runId
  })) {
    yield event;
  }
}

export async function invokeAgentSubrun(input: SubagentRunInput & { prisma: PrismaClient }): Promise<SubagentRunOutput> {
  const runtime = await getAgentRuntime(input.prisma);
  return runtime.core.invokeSubagents({
    threadId: input.threadId,
    runId: input.runId,
    prompt: input.prompt,
    tasks: input.tasks,
    provider: input.provider,
    model: input.model,
    metadata: input.metadata,
    enabledSkills: input.enabledSkills,
    maxConcurrency: input.maxConcurrency,
    taskTimeoutMs: input.taskTimeoutMs,
    roleModelOverrides: input.roleModelOverrides
  });
}

export async function* invokeAgentSubrunStream(input: SubagentRunInput & { prisma: PrismaClient }): AsyncGenerator<AgentRunEvent> {
  const runtime = await getAgentRuntime(input.prisma);
  for await (const event of runtime.core.invokeSubagentsStream({
    threadId: input.threadId,
    runId: input.runId,
    prompt: input.prompt,
    tasks: input.tasks,
    provider: input.provider,
    model: input.model,
    metadata: input.metadata,
    enabledSkills: input.enabledSkills,
    maxConcurrency: input.maxConcurrency,
    taskTimeoutMs: input.taskTimeoutMs,
    roleModelOverrides: input.roleModelOverrides
  })) {
    yield event;
  }
}

export async function listRuntimeThreads(prisma: PrismaClient, limit = 20): Promise<ThreadSummary[]> {
  const runtime = await getAgentRuntime(prisma);
  return runtime.core.listThreads(limit);
}

export async function getRuntimeThread(prisma: PrismaClient, threadId: string): Promise<ThreadDetail> {
  const runtime = await getAgentRuntime(prisma);
  return runtime.core.getThread(threadId);
}

export async function listRuntimeSkills(prisma: PrismaClient, enabledOnly = false): Promise<Skill[]> {
  const runtime = await getAgentRuntime(prisma);
  return runtime.core.listSkills({ enabledOnly });
}

export async function getRuntimeSkill(prisma: PrismaClient, name: string): Promise<Skill | null> {
  const runtime = await getAgentRuntime(prisma);
  return runtime.core.getSkill(name);
}

export async function listRuntimeMemoryFacts(prisma: PrismaClient, threadId: string): Promise<MemoryFact[]> {
  const runtime = await getAgentRuntime(prisma);
  return runtime.core.listMemoryFacts(threadId);
}

export async function createRuntimeMemoryFact(
  prisma: PrismaClient,
  threadId: string,
  input: { content: string; category?: string; confidence?: number; metadata?: Record<string, unknown> }
): Promise<MemoryFact> {
  const runtime = await getAgentRuntime(prisma);
  return runtime.core.createMemoryFact(threadId, input);
}

export async function deleteRuntimeMemoryFact(prisma: PrismaClient, threadId: string, factId: string): Promise<boolean> {
  const runtime = await getAgentRuntime(prisma);
  return runtime.core.deleteMemoryFact(threadId, factId);
}

export async function listRuntimeMcpPlugins(prisma: PrismaClient): Promise<McpPluginInfo[]> {
  const runtime = await getAgentRuntime(prisma);
  return runtime.core.listMcpPlugins();
}

export async function listRuntimeMcpTools(
  prisma: PrismaClient,
  input: { threadId?: string; runId?: string; metadata?: Record<string, unknown> } = {}
): Promise<McpToolInfo[]> {
  const runtime = await getAgentRuntime(prisma);
  return runtime.core.listMcpTools(input);
}

export async function invokeRuntimeMcpTool(
  prisma: PrismaClient,
  input: {
    toolName: string;
    arguments?: unknown;
    threadId?: string;
    runId?: string;
    metadata?: Record<string, unknown>;
  }
): Promise<{ plugin: string; toolName: string; output: unknown }> {
  const runtime = await getAgentRuntime(prisma);
  return runtime.core.invokeMcpTool(input);
}
