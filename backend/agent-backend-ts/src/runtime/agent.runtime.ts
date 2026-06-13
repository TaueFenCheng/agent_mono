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
} from "@intelligent-agent/agent-core";
import { PrismaMemoryStore } from "../infra/prisma-memory.store.js";
import { z } from "zod";
import path from "path";

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

  const mcpPlugins = await loadMcpPluginsFromEnv();
  for (const plugin of mcpPlugins) {
    registry.useMcpPlugin(plugin);
  }

  // ── 文件系统和命令执行工具 ──
  registry.registerLocalTool({
    name: "read_file",
    description: "Read the full content of a file by path. Supports optional line offset.",
    schema: z.object({
      path: z.string().describe("File path (absolute or relative)"),
      offset: z.number().optional().describe("Starting line number (0-based)"),
      limit: z.number().optional().describe("Number of lines to read"),
    }),
    executionMode: "sequential",
    timeoutMs: 10000,
    invoke: async (input) => {
      const fs = await import("fs/promises");
      const filePath = path.resolve(input.path);
      const content = await fs.readFile(filePath, "utf-8");
      if (input.offset !== undefined || input.limit !== undefined) {
        const lines = content.split("\n");
        const start = input.offset ?? 0;
        const end = input.limit ? start + input.limit : lines.length;
        return lines.slice(start, end).join("\n");
      }
      return content;
    },
  });

  registry.registerLocalTool({
    name: "write_file",
    description: "Write content to a file. Creates parent directories if needed.",
    schema: z.object({
      path: z.string().describe("File path"),
      content: z.string().describe("Content to write"),
    }),
    executionMode: "sequential",
    timeoutMs: 10000,
    invoke: async (input) => {
      const fs = await import("fs/promises");
      const filePath = path.resolve(input.path);
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, input.content, "utf-8");
      const stat = await fs.stat(filePath);
      return `Written ${filePath} (${stat.size} bytes)`;
    },
  });

  registry.registerLocalTool({
    name: "execute_command",
    description: "Execute a shell command and return stdout/stderr.",
    schema: z.object({
      command: z.string().describe("Shell command to execute"),
      workdir: z.string().optional().describe("Working directory"),
      timeout: z.number().optional().default(30000).describe("Timeout in ms"),
    }),
    executionMode: "sequential",
    timeoutMs: 60000,
    invoke: async (input) => {
      const { execSync } = await import("child_process");
      try {
        const output = execSync(input.command, {
          cwd: input.workdir ?? process.cwd(),
          timeout: input.timeout ?? 30000,
          encoding: "utf-8",
          maxBuffer: 10 * 1024 * 1024,
        });
        return output || "(command completed with no output)";
      } catch (error: unknown) {
        const err = error as { stdout?: string; stderr?: string; message?: string };
        if (err.stdout) return err.stdout;
        if (err.stderr) return `Error: ${err.stderr}`;
        return `Execution failed: ${err.message ?? String(error)}`;
      }
    },
  });

  registry.registerLocalTool({
    name: "list_files",
    description: "List files and directories in a given path. Supports glob pattern.",
    schema: z.object({
      path: z.string().describe("Directory path"),
      pattern: z.string().optional().describe("Glob pattern filter, e.g. *.ts"),
    }),
    executionMode: "sequential",
    timeoutMs: 10000,
    invoke: async (input) => {
      const fs = await import("fs/promises");
      const dirPath = path.resolve(input.path);
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      const results = [];
      for (const entry of entries) {
        const isDir = entry.isDirectory();
        const size = isDir ? null : (await fs.stat(path.join(dirPath, entry.name))).size;
        if (input.pattern) {
          const re = new RegExp("^" + input.pattern.replace(/\*/g, ".*").replace(/\?/g, ".") + "$");
          if (!re.test(entry.name)) continue;
        }
        results.push({ name: entry.name, type: isDir ? "dir" : "file", size });
      }
      return results;
    },
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
