import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { SubagentRunRecordResponse, SubagentRunResponse } from "@tang-agent/core-types";
import { DatabaseService } from "../infra/database.service.js";
import { RedisService } from "../infra/redis.service.js";
import { AgentQueueService } from "../agent/agent-queue.service.js";
import { invokeAgentSubrun, invokeAgentSubrunStream } from "../runtime/agent.runtime.js";
import type { SubagentRunDto } from "./subagent.dto.js";

@Injectable()
export class SubagentService {
  constructor(
    private readonly db: DatabaseService,
    private readonly redis: RedisService,
    private readonly agentQueue: AgentQueueService
  ) {}

  private resolveSubagentInput(payload: SubagentRunDto) {
    if ((!payload.tasks || payload.tasks.length === 0) && !payload.prompt?.trim()) {
      throw new BadRequestException("Subagent run requires non-empty `tasks` or `prompt`.");
    }
    if (payload.tasks && payload.tasks.length > 8) {
      throw new BadRequestException("Subagent run supports at most 8 tasks per run.");
    }

    const threadId = payload.threadId ?? payload.sessionId ?? `thread-${Date.now()}`;
    const runId = `subrun-${Date.now()}`;
    const roleModelOverrides = {
      planner: payload.planner,
      researcher: payload.researcher,
      coder: payload.coder
    };
    return {
      threadId,
      runId,
      prompt: payload.prompt,
      tasks: payload.tasks,
      provider: payload.provider ?? process.env.AGENT_PROVIDER ?? "qwen",
      model: payload.model,
      metadata: { user_id: payload.userId, ...(payload.metadata ?? {}) },
      enabledSkills: payload.enabledSkills,
      maxConcurrency: payload.maxConcurrency,
      taskTimeoutMs: payload.taskTimeoutMs,
      roleModelOverrides
    };
  }

  private buildSubrunCacheKey(input: ReturnType<SubagentService["resolveSubagentInput"]>): string {
    return `agent:subrun:${input.provider}:${input.model ?? "default"}:${input.threadId}:${JSON.stringify({
      prompt: input.prompt ?? null,
      tasks: input.tasks?.map((item) => ({ role: item.role, prompt: item.prompt, provider: item.provider ?? null, model: item.model ?? null })) ?? []
    })}`;
  }

  async runSubagents(payload: SubagentRunDto): Promise<SubagentRunResponse> {
    const normalized = this.resolveSubagentInput(payload);
    const cacheKey = this.buildSubrunCacheKey(normalized);
    const cached = await this.redis.getCachedOutput(cacheKey);
    if (cached) {
      try {
        return JSON.parse(cached) as SubagentRunResponse;
      } catch {
        // ignore stale format and continue
      }
    }

    const subrun = await invokeAgentSubrun({
      ...normalized,
      prisma: this.db.getPrisma()
    });

    await this.db.appendSubagentRunRecord({
      runId: subrun.runId,
      threadId: subrun.threadId,
      prompt: normalized.prompt ?? null,
      summary: subrun.summary,
      partial: subrun.partial,
      results: subrun.results as any
    });
    await this.redis.setCachedOutput(cacheKey, JSON.stringify(subrun));
    return subrun as unknown as SubagentRunResponse;
  }

  async runSubagentsStream(
    payload: SubagentRunDto,
    onEvent: (event: Record<string, unknown>) => Promise<void> | void
  ): Promise<void> {
    const normalized = this.resolveSubagentInput(payload);
    for await (const event of invokeAgentSubrunStream({
      ...normalized,
      prisma: this.db.getPrisma()
    })) {
      await onEvent(event as unknown as Record<string, unknown>);
    }
  }

  async getSubrun(runId: string): Promise<SubagentRunRecordResponse> {
    const run = await this.db.getSubagentRun(runId);
    if (!run) throw new NotFoundException("Subagent run not found");
    return run;
  }

  async submitSubrun(payload: SubagentRunDto): Promise<{ jobId: string; status: string }> {
    return this.agentQueue.submitSubrun(payload);
  }

  async getSubrunJobStatus(jobId: string): Promise<{
    jobId: string;
    status: string;
    progress?: number;
    result?: Record<string, unknown> | null;
    failedReason?: string | null;
    createdAt?: string | null;
    finishedAt?: string | null;
  }> {
    return this.agentQueue.getSubrunJobStatus(jobId);
  }
}

