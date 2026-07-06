import type { PrismaClient } from "@prisma/client";
import {
  AgentCore,
  type AgentToolRegistry,
  type CoreProvider,
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
} from "@intelligent-agent/agent-core";
import { PrismaMemoryStore } from "../infra/prisma-memory.store.js";
import { z } from "zod";
import path from "path";
import { HostExecutionBackend, type ExecutionBackend, SandboxManager } from "./execution-backend.js";

const CORE_PROVIDERS = new Set<CoreProvider>(["qwen", "glm", "openai", "anthropic", "gemini", "deepseek"]);

function asCoreProvider(value?: string): CoreProvider | undefined {
  if (!value) return undefined;
  return CORE_PROVIDERS.has(value as CoreProvider) ? (value as CoreProvider) : undefined;
}

const READ_FILE_SCHEMA = z.object({
  path: z.string().describe("File path"),
  offset: z.number().optional().describe("Starting line number (0-based)"),
  limit: z.number().optional().describe("Number of lines to read")
});

const WRITE_FILE_SCHEMA = z.object({
  path: z.string().describe("File path"),
  content: z.string().describe("Content to write")
});

const EXECUTE_COMMAND_SCHEMA = z.object({
  command: z.string().describe("Shell command to execute"),
  workdir: z.string().optional().describe("Working directory"),
  timeout: z.number().optional().default(30000).describe("Timeout in ms")
});

const LIST_FILES_SCHEMA = z.object({
  path: z.string().describe("Directory path"),
  pattern: z.string().optional().describe("Glob pattern filter, e.g. *.ts")
});

const SANDBOX_TOOL_CONTEXT_SCHEMA = z.object({
  executionBackendId: z.string().min(1),
  sandboxSubThreadId: z.string().min(1),
  sandboxWorkspaceRoot: z.string().min(1)
});

function registerExecutionTools(args: {
  registry: AgentToolRegistry;
  resolveBackend: (context: { toolContext?: Record<string, unknown> }) => Promise<ExecutionBackend> | ExecutionBackend;
  prefix?: string;
  sandboxOnly?: boolean;
}) {
  const { registry, resolveBackend, prefix = "", sandboxOnly = false } = args;
  const name = (base: string) => `${prefix}${base}`;
  const pathDescription = sandboxOnly ? "Relative path inside the sandbox workspace." : "File path (absolute or relative).";
  const workdirDescription = sandboxOnly ? "Relative working directory inside the sandbox workspace." : "Working directory.";

  registry.registerLocalTool({
    name: name("read_file"),
    description: sandboxOnly
      ? "Read file content from the sandbox workspace. Supports optional line offset."
      : "Read the full content of a file by path. Supports optional line offset.",
    schema: READ_FILE_SCHEMA.extend({
      path: z.string().describe(pathDescription)
    }),
    executionMode: "sequential",
    timeoutMs: 10000,
    invoke: async (input, context) => {
      const backend = await resolveBackend(context);
      return backend.readFile(input.path, { offset: input.offset, limit: input.limit });
    }
  });

  registry.registerLocalTool({
    name: name("write_file"),
    description: sandboxOnly
      ? "Write content to a file inside the sandbox workspace."
      : "Write content to a file. Creates parent directories if needed.",
    schema: WRITE_FILE_SCHEMA.extend({
      path: z.string().describe(pathDescription)
    }),
    executionMode: "sequential",
    timeoutMs: 10000,
    invoke: async (input, context) => {
      const backend = await resolveBackend(context);
      return backend.writeFile(input.path, input.content);
    }
  });

  registry.registerLocalTool({
    name: name("execute_command"),
    description: sandboxOnly
      ? "Execute a shell command inside the sandbox workspace and return stdout/stderr."
      : "Execute a shell command and return stdout/stderr.",
    schema: EXECUTE_COMMAND_SCHEMA.extend({
      workdir: z.string().optional().describe(workdirDescription)
    }),
    executionMode: "sequential",
    timeoutMs: 60000,
    invoke: async (input, context) => {
      const backend = await resolveBackend(context);
      return backend.execute(input.command, {
        workdir: input.workdir,
        timeout: input.timeout
      });
    }
  });

  registry.registerLocalTool({
    name: name("list_files"),
    description: sandboxOnly
      ? "List files and directories in the sandbox workspace. Supports glob pattern."
      : "List files and directories in a given path. Supports glob pattern.",
    schema: LIST_FILES_SCHEMA.extend({
      path: z.string().describe(sandboxOnly ? "Relative directory path inside the sandbox workspace." : "Directory path")
    }),
    executionMode: "sequential",
    timeoutMs: 10000,
    invoke: async (input, context) => {
      const backend = await resolveBackend(context);
      return backend.listFiles(input.path, input.pattern);
    }
  });
}

function resolveSandboxBackend(sandboxManager: SandboxManager, toolContext?: Record<string, unknown>): ExecutionBackend {
  const parsed = SANDBOX_TOOL_CONTEXT_SCHEMA.safeParse(toolContext ?? {});
  if (!parsed.success) {
    throw new Error("Sandbox execution requires toolContext with executionBackendId, sandboxSubThreadId, and sandboxWorkspaceRoot.");
  }
  const session = sandboxManager.getSession(parsed.data.sandboxSubThreadId);
  if (!session) {
    throw new Error(`Sandbox session not found for sub-thread: ${parsed.data.sandboxSubThreadId}`);
  }
  if (session.backendId !== parsed.data.executionBackendId) {
    throw new Error(`Sandbox backend mismatch: expected ${session.backendId}, got ${parsed.data.executionBackendId}`);
  }
  if (session.workspaceRoot !== parsed.data.sandboxWorkspaceRoot) {
    throw new Error(`Sandbox workspace mismatch: expected ${session.workspaceRoot}, got ${parsed.data.sandboxWorkspaceRoot}`);
  }
  return session.backend;
}

export interface AgentRuntime {
  core: AgentCore;
  checkpointerKind: "memory" | "postgres";
  close(): Promise<void>;
}

export interface ActiveModelConfig {
  provider: string;
  model: string;
  apiKey: string;
  baseUrl: string;
}

export async function getActiveModelConfig(prisma: PrismaClient, userId?: string | null): Promise<ActiveModelConfig | null> {
  if (!userId) return null;
  const config = await prisma.modelConfig.findFirst({
    where: { userId, isActive: true }
  });
  if (!config) return null;
  return {
    provider: config.provider,
    model: config.model,
    apiKey: config.apiKey,
    baseUrl: config.baseUrl
  };
}

async function createCore(prisma: PrismaClient): Promise<AgentRuntime> {
  const memoryStore = new PrismaMemoryStore(prisma);
  await memoryStore.setup();

  const registry = registerBuiltinTools(new DefaultAgentToolRegistry());
  const skillRegistry = new SkillRegistry();
  const hostExecutionBackend = new HostExecutionBackend(process.cwd());
  const sandboxManager = new SandboxManager({
    baseDir: process.env.AGENT_SANDBOX_ROOT ?? path.resolve(process.cwd(), ".agent", "sandboxes"),
    sourceProjectRoot: process.cwd()
  });
  let runtimeRef: AgentRuntime | null = null;

  const mcpPlugins = await loadMcpPluginsFromEnv();
  for (const plugin of mcpPlugins) {
    registry.useMcpPlugin(plugin);
  }

  registerExecutionTools({
    registry,
    resolveBackend: () => hostExecutionBackend
  });
  registerExecutionTools({
    registry,
    prefix: "sandbox_",
    sandboxOnly: true,
    resolveBackend: async (context) => resolveSandboxBackend(sandboxManager, context.toolContext)
  });

  registry.registerLocalTool({
    name: "invoke_subagents",
    description:
      "Delegate a complex task to specialized subagents (planner/researcher/coder). Use this when the task benefits from structured decomposition, parallel research, or a separate implementation pass.",
    schema: z.object({
      prompt: z.string().trim().optional().describe("High-level objective for the subagents. Required when `tasks` is empty."),
      tasks: z
        .array(
          z.object({
            taskId: z.string().trim().optional().describe("Optional explicit task id"),
            role: z.enum(["planner", "researcher", "coder"]).describe("Which specialized subagent should handle the task"),
            prompt: z.string().trim().min(1).describe("Concrete instruction for this subagent"),
            provider: z.string().trim().optional().describe("Optional provider override for this task"),
            model: z.string().trim().optional().describe("Optional model override for this task")
          })
        )
        .max(8)
        .optional()
        .describe("Optional explicit subagent task list. If omitted, the planner will create tasks automatically."),
      provider: z.string().trim().optional().describe("Default provider override for the subagent run"),
      model: z.string().trim().optional().describe("Default model override for the subagent run"),
      maxConcurrency: z.number().int().min(1).max(8).optional().describe("Maximum parallel subagent workers"),
      taskTimeoutMs: z.number().int().min(500).max(300000).optional().describe("Per-task timeout in milliseconds"),
      planner: z
        .object({
          provider: z.string().trim().optional(),
          model: z.string().trim().optional()
        })
        .optional()
        .describe("Optional model override for the planner subagent"),
      researcher: z
        .object({
          provider: z.string().trim().optional(),
          model: z.string().trim().optional()
        })
        .optional()
        .describe("Optional model override for the researcher subagent"),
      coder: z
        .object({
          provider: z.string().trim().optional(),
          model: z.string().trim().optional()
        })
        .optional()
        .describe("Optional model override for the coder subagent")
    }),
    executionMode: "sequential",
    timeoutMs: 300000,
    invoke: async (input, context) => {
      if (!runtimeRef) {
        throw new Error("Agent runtime is not ready for subagent delegation.");
      }
      if (!context.threadId) {
        throw new Error("threadId is required for subagent delegation.");
      }

      const result = await runtimeRef.core.invokeSubagents({
        threadId: context.threadId,
        runId: context.runId ? `${context.runId}:subagents` : undefined,
        prompt: input.prompt,
        tasks: input.tasks?.map((task) => ({
          ...task,
          provider: asCoreProvider(task.provider)
        })),
        provider: asCoreProvider(input.provider),
        model: input.model,
        metadata: context.metadata,
        maxConcurrency: input.maxConcurrency,
        taskTimeoutMs: input.taskTimeoutMs,
        roleModelOverrides: {
          ...(input.planner
            ? { planner: { provider: asCoreProvider(input.planner.provider), model: input.planner.model } }
            : {}),
          ...(input.researcher
            ? { researcher: { provider: asCoreProvider(input.researcher.provider), model: input.researcher.model } }
            : {}),
          ...(input.coder
            ? { coder: { provider: asCoreProvider(input.coder.provider), model: input.coder.model } }
            : {})
        }
      });

      return {
        runId: result.runId,
        threadId: result.threadId,
        partial: result.partial,
        summary: result.summary,
        tasks: result.tasks,
        results: result.results.map((item) => ({
          taskId: item.taskId,
          role: item.role,
          status: item.status,
          threadId: item.threadId,
          provider: item.provider,
          model: item.model,
          output: item.output,
          error: item.error,
          durationMs: item.durationMs,
          checkpointId: item.checkpointId
        }))
      };
    }
  });

  let checkpointerManager: CheckpointerManager;
  try {
    checkpointerManager = await createCheckpointerManager({
      backend: process.env.AGENT_CHECKPOINTER_BACKEND ?? "postgres",
      connectionString:
        process.env.POSTGRES_URL ??
        `postgresql://${process.env.POSTGRES_USER ?? "intelligent"}:${process.env.POSTGRES_PASSWORD ?? "intelligent"}@${process.env.POSTGRES_HOST ?? "127.0.0.1"}:${process.env.POSTGRES_PORT ?? "5432"}/${process.env.POSTGRES_DB ?? "intelligent_agent"}`
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(`[agent-runtime] postgres checkpointer init failed, fallback to memory: ${reason}`);
    checkpointerManager = await createCheckpointerManager({ backend: "memory" });
  }

  const runtime: AgentRuntime = {
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
        resolveToolContext: async ({ role, subThreadId }) => {
          if (role !== "coder") return undefined;
          const session = await sandboxManager.ensureSession(subThreadId, role);
          return {
            executionBackendId: session.backendId,
            sandboxSubThreadId: session.subThreadId,
            sandboxWorkspaceRoot: session.workspaceRoot
          };
        },
        getSandboxInfo: (subThreadId) => {
          const session = sandboxManager.getSession(subThreadId);
          if (!session) return null;
          return {
            backendId: session.backendId,
            workspaceRoot: session.workspaceRoot,
            preserved: session.preserved
          };
        },
        roleToolAllowlist: {
          planner: ["list_skills", "read_skill", "echo_text", "get_time"],
          researcher: ["list_skills", "read_skill", "list_memory", "get_time", "echo_text"],
          coder: [
            "list_skills",
            "read_skill",
            "remember_fact",
            "list_memory",
            "calculate",
            "echo_text",
            "get_time",
            "sandbox_read_file",
            "sandbox_write_file",
            "sandbox_list_files",
            "sandbox_execute_command"
          ]
        }
      }
    }),
    checkpointerKind: checkpointerManager.kind,
    close: async () => {
      await checkpointerManager.close();
    }
  };
  runtimeRef = runtime;
  return runtime;
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
  systemContext?: string;
  provider?: string;
  model?: string;
  metadata?: Record<string, unknown>;
  enabledSkills?: string[];
  runId?: string;
  userId?: string | null;
  prisma: PrismaClient;
}) {
  const runtime = await getAgentRuntime(input.prisma);

  // 如果请求未指定 provider/model，尝试从数据库获取激活的配置
  let provider = input.provider;
  let model = input.model;
  let providerConfigs: Record<string, { apiKey?: string; baseUrl?: string; model?: string }> | undefined;

  if (!provider && !model) {
    const activeConfig = await getActiveModelConfig(input.prisma, input.userId);
    if (activeConfig) {
      provider = activeConfig.provider;
      model = activeConfig.model;
      // 将激活配置的 apiKey 和 baseUrl 注入到 providerConfigs
      providerConfigs = {
        [activeConfig.provider]: {
          apiKey: activeConfig.apiKey,
          baseUrl: activeConfig.baseUrl,
          model: activeConfig.model
        }
      };
    }
  }

  return runtime.core.invoke({
    prompt: input.prompt,
    threadId: input.threadId,
    systemContext: input.systemContext,
    provider,
    model,
    metadata: input.metadata,
    enabledSkills: input.enabledSkills,
    runId: input.runId,
    providerConfigs
  });
}

export async function* invokeAgentStream(input: {
  prompt: string;
  threadId: string;
  systemContext?: string;
  provider?: string;
  model?: string;
  metadata?: Record<string, unknown>;
  enabledSkills?: string[];
  runId?: string;
  userId?: string | null;
  prisma: PrismaClient;
}): AsyncGenerator<AgentRunEvent> {
  const runtime = await getAgentRuntime(input.prisma);

  // 如果请求未指定 provider/model，尝试从数据库获取激活的配置
  let provider = input.provider;
  let model = input.model;
  let providerConfigs: Record<string, { apiKey?: string; baseUrl?: string; model?: string }> | undefined;

  if (!provider && !model) {
    const activeConfig = await getActiveModelConfig(input.prisma, input.userId);
    if (activeConfig) {
      provider = activeConfig.provider;
      model = activeConfig.model;
      providerConfigs = {
        [activeConfig.provider]: {
          apiKey: activeConfig.apiKey,
          baseUrl: activeConfig.baseUrl,
          model: activeConfig.model
        }
      };
    }
  }

  for await (const event of runtime.core.invokeStream({
    prompt: input.prompt,
    threadId: input.threadId,
    systemContext: input.systemContext,
    provider,
    model,
    metadata: input.metadata,
    enabledSkills: input.enabledSkills,
    runId: input.runId,
    providerConfigs
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
