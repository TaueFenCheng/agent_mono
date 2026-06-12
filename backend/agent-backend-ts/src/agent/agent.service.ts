import { BadRequestException, Injectable, NotFoundException, OnModuleDestroy } from "@nestjs/common";
import type {
  AgentRunResponse,
  CreateMemoryFactRequest,
  InvokeMcpToolRequest,
  InvokeMcpToolResponse,
  MemoryFactResponse,
  McpPluginListResponse,
  McpToolListResponse,
  RunRecordResponse,
  SkillListResponse,
  SkillResponse,
  ThreadDetailResponse,
  ThreadListResponse,
  ThreadMemoryResponse
} from "@intelligent-agent/core-types";
import { DatabaseService } from "../infra/database.service.js";
import { RedisService } from "../infra/redis.service.js";
import { AgentQueueService } from "./agent-queue.service.js";
import {
  createRuntimeMemoryFact,
  deleteRuntimeMemoryFact,
  getAgentRuntime,
  getRuntimeSkill,
  getRuntimeThread,
  invokeAgent,
  invokeAgentStream,
  invokeRuntimeMcpTool,
  listRuntimeMcpPlugins,
  listRuntimeMcpTools,
  listRuntimeMemoryFacts,
  listRuntimeSkills,
  listRuntimeThreads,
  shutdownAgentRuntime
} from "../runtime/agent.runtime.js";
import type { AgentRunDto } from "./agent.dto.js";
import { resolvePrompt, resolveThreadId, type AgentRunPayloadLike } from "./agent.payload.js";

@Injectable()
export class AgentService implements OnModuleDestroy {
  constructor(
    private readonly db: DatabaseService,
    private readonly redis: RedisService,
    private readonly agentQueue: AgentQueueService
  ) {}

  async run(payload: AgentRunDto, userId?: string): Promise<AgentRunResponse> {
    const normalizedPayload = payload as AgentRunPayloadLike;
    const threadId = resolveThreadId(normalizedPayload, `thread-${Date.now()}`);
    const runId = `nest-${Date.now()}`;
    const lastMessage = resolvePrompt(normalizedPayload);
    if (!lastMessage) {
      throw new BadRequestException("Request body must include `messages` (non-empty) or `message`.");
    }
    const requestedProvider = payload.provider;
    const effectiveUserId = userId ?? payload.userId ?? "anonymous";
    const cacheProvider = requestedProvider ?? process.env.AGENT_PROVIDER ?? "qwen";
    const cacheKey = `agent:run:${effectiveUserId}:${cacheProvider}:${payload.model ?? "default"}:${threadId}:${lastMessage}`;

    const cached = await this.redis.getCachedOutput(cacheKey);
    if (cached) {
      return {
        runId,
        threadId,
        output: cached,
        provider: String(cacheProvider),
        createdAt: new Date().toISOString(),
        cached: true,
        checkpointId: null,
        toolCount: 0
      };
    }

    let response: AgentRunResponse;
    try {
      const runtimeResult = await invokeAgent({
        prompt: lastMessage,
        threadId,
        provider: requestedProvider,
        model: payload.model,
        metadata: { user_id: userId ?? payload.userId, ...(payload.metadata ?? {}) },
        enabledSkills: payload.enabledSkills,
        runId,
        userId: effectiveUserId === "anonymous" ? null : effectiveUserId,
        prisma: this.db.getPrisma()
      });

      response = {
        runId,
        threadId,
        output: runtimeResult.output,
        provider: runtimeResult.provider,
        createdAt: new Date().toISOString(),
        cached: false,
        checkpointId: runtimeResult.checkpointId ?? null,
        toolCount: runtimeResult.toolCount
      };
    } catch (error) {
      response = {
        runId,
        threadId,
        output: `agent runtime error: ${error instanceof Error ? error.message : String(error)}`,
        provider: String(cacheProvider),
        createdAt: new Date().toISOString(),
        cached: false,
        checkpointId: null,
        toolCount: 0
      };
    }

    await this.db.appendRunRecord({
      runId,
      threadId,
      userId: userId ?? null,
      prompt: lastMessage,
      output: response.output,
      provider: response.provider,
      model: payload.model ?? null,
      checkpointId: response.checkpointId ?? null
    });
    await this.redis.setCachedOutput(cacheKey, response.output);

    return response;
  }

  async runStream(
    payload: AgentRunDto,
    onEvent: (event: Record<string, unknown>) => Promise<void> | void,
    userId?: string
  ): Promise<void> {
    const normalizedPayload = payload as AgentRunPayloadLike;
    const threadId = resolveThreadId(normalizedPayload, `thread-${Date.now()}`);
    const runId = `nest-${Date.now()}`;
    const lastMessage = resolvePrompt(normalizedPayload);
    if (!lastMessage) {
      throw new BadRequestException("Request body must include `messages` (non-empty) or `message`.");
    }
    const requestedProvider = payload.provider;
    const effectiveUserId = userId ?? payload.userId ?? "anonymous";
    const cacheProvider = requestedProvider ?? process.env.AGENT_PROVIDER ?? "qwen";
    const cacheKey = `agent:run:${effectiveUserId}:${cacheProvider}:${payload.model ?? "default"}:${threadId}:${lastMessage}`;

    const cached = await this.redis.getCachedOutput(cacheKey);
    if (cached) {
      await onEvent({
        type: "run_start",
        runId,
        threadId,
        at: new Date().toISOString()
      });
      await onEvent({
        type: "run_end",
        runId,
        threadId,
        provider: String(cacheProvider),
        output: cached,
        checkpointId: null,
        toolCount: 0,
        at: new Date().toISOString(),
        cached: true
      });
      return;
    }

    let runEndEvent: {
      provider: string;
      output: string;
      checkpointId?: string | null;
      toolCount?: number;
    } | null = null;
    let runtimeError: string | null = null;

    try {
      for await (const event of invokeAgentStream({
        prompt: lastMessage,
        threadId,
        provider: requestedProvider,
        model: payload.model,
        metadata: { user_id: userId ?? payload.userId, ...(payload.metadata ?? {}) },
        enabledSkills: payload.enabledSkills,
        runId,
        userId: effectiveUserId === "anonymous" ? null : effectiveUserId,
        prisma: this.db.getPrisma()
      })) {
        if (event.type === "run_end") {
          runEndEvent = {
            provider: event.provider,
            output: event.output,
            checkpointId: event.checkpointId,
            toolCount: event.toolCount
          };
        }
        if (event.type === "error") {
          runtimeError = event.message;
        }
        await onEvent(event as unknown as Record<string, unknown>);
      }
    } catch (error) {
      if (!runtimeError) {
        runtimeError = error instanceof Error ? error.message : String(error);
      }
    }

    if (runEndEvent) {
      await this.db.appendRunRecord({
        runId,
        threadId,
        userId: userId ?? null,
        prompt: lastMessage,
        output: runEndEvent.output,
        provider: runEndEvent.provider,
        model: payload.model ?? null,
        checkpointId: runEndEvent.checkpointId ?? null
      });
      await this.redis.setCachedOutput(cacheKey, runEndEvent.output);
      return;
    }

    throw new Error(runtimeError ?? "Agent stream did not return a final run_end event.");
  }

  async getRun(runId: string): Promise<RunRecordResponse> {
    const run = await this.db.getRun(runId);
    if (!run) throw new NotFoundException("Run not found");
    return run;
  }

  async listThreads(limit = 20, userId?: string): Promise<ThreadListResponse> {
    const allThreads = await listRuntimeThreads(this.db.getPrisma(), limit * 3);
    if (!userId) {
      return { thread_list: allThreads.slice(0, limit) };
    }
    const userThreadIds = new Set(await this.db.listThreadIdsByUser(userId, limit * 3));
    return { thread_list: allThreads.filter((t) => userThreadIds.has(t.thread_id)).slice(0, limit) };
  }

  async getThread(threadId: string, userId?: string): Promise<ThreadDetailResponse> {
    if (userId) {
      const userThreadIds = new Set(await this.db.listThreadIdsByUser(userId));
      if (!userThreadIds.has(threadId)) {
        throw new NotFoundException("Thread not found");
      }
    }
    return await getRuntimeThread(this.db.getPrisma(), threadId);
  }

  async listMemory(threadId: string, userId?: string): Promise<ThreadMemoryResponse> {
    if (userId) await this.verifyThreadOwnership(threadId, userId);
    const facts = await listRuntimeMemoryFacts(this.db.getPrisma(), threadId);
    return {
      thread_id: threadId,
      facts: facts.map((fact) => ({
        id: fact.id,
        thread_id: fact.threadId,
        content: fact.content,
        category: fact.category,
        confidence: fact.confidence,
        metadata: fact.metadata,
        created_at: fact.createdAt,
        updated_at: fact.updatedAt
      }))
    };
  }

  async createMemory(threadId: string, payload: CreateMemoryFactRequest, userId?: string): Promise<MemoryFactResponse> {
    if (userId) await this.verifyThreadOwnership(threadId, userId);
    const fact = await createRuntimeMemoryFact(this.db.getPrisma(), threadId, {
      content: payload.content,
      category: payload.category,
      confidence: payload.confidence,
      metadata: payload.metadata
    });
    return {
      id: fact.id,
      thread_id: fact.threadId,
      content: fact.content,
      category: fact.category,
      confidence: fact.confidence,
      metadata: fact.metadata,
      created_at: fact.createdAt,
      updated_at: fact.updatedAt
    };
  }

  async deleteMemory(threadId: string, factId: string, userId?: string): Promise<{ deleted: boolean }> {
    if (userId) await this.verifyThreadOwnership(threadId, userId);
    return { deleted: await deleteRuntimeMemoryFact(this.db.getPrisma(), threadId, factId) };
  }

  private async verifyThreadOwnership(threadId: string, userId: string): Promise<void> {
    const userThreadIds = new Set(await this.db.listThreadIdsByUser(userId));
    if (!userThreadIds.has(threadId)) {
      throw new NotFoundException("Thread not found");
    }
  }

  async listSkills(enabledOnly = false): Promise<SkillListResponse> {
    const skills = await listRuntimeSkills(this.db.getPrisma(), enabledOnly);
    return {
      skills: skills.map((skill) => ({
        name: skill.name,
        description: skill.description,
        path: skill.path,
        metadata: skill.metadata
      }))
    };
  }

  async getSkill(name: string): Promise<SkillResponse> {
    const skill = await getRuntimeSkill(this.db.getPrisma(), name);
    if (!skill) throw new NotFoundException("Skill not found");
    return {
      name: skill.name,
      description: skill.description,
      path: skill.path,
      metadata: skill.metadata,
      content: skill.content
    };
  }

  async listMcpPlugins(): Promise<McpPluginListResponse> {
    const plugins = await listRuntimeMcpPlugins(this.db.getPrisma());
    return { plugins };
  }

  async listMcpTools(input: { threadId?: string; runId?: string } = {}): Promise<McpToolListResponse> {
    const tools = await listRuntimeMcpTools(this.db.getPrisma(), input);
    return { tools };
  }

  async invokeMcpTool(toolName: string, payload: InvokeMcpToolRequest): Promise<InvokeMcpToolResponse> {
    const result = await invokeRuntimeMcpTool(this.db.getPrisma(), {
      toolName,
      arguments: payload.arguments,
      threadId: payload.threadId,
      runId: payload.runId,
      metadata: payload.metadata
    });
    return {
      plugin: result.plugin,
      toolName: result.toolName,
      output: result.output
    };
  }

  async submitRun(payload: AgentRunDto, userId?: string): Promise<{ jobId: string; status: string }> {
    const enriched = userId ? { ...payload, userId } : payload;
    return this.agentQueue.submitRun(enriched);
  }

  async getJobStatus(jobId: string): Promise<{
    jobId: string;
    status: string;
    progress?: number;
    result?: Record<string, unknown> | null;
    failedReason?: string | null;
    createdAt?: string | null;
    finishedAt?: string | null;
  }> {
    return this.agentQueue.getJobStatus(jobId);
  }

  async getCheckpointerKind(): Promise<"memory" | "postgres"> {
    const runtime = await getAgentRuntime(this.db.getPrisma());
    return runtime.checkpointerKind;
  }

  async onModuleDestroy() {
    await shutdownAgentRuntime();
  }
}
