import { Inject, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { Worker } from "bullmq";
import type { Job } from "bullmq";
import { DatabaseService } from "../infra/database.service.js";
import { invokeAgent, invokeAgentSubrun } from "../runtime/agent.runtime.js";
import type { AgentRunDto } from "./agent.dto.js";
import type { SubagentRunDto } from "../subagent/subagent.dto.js";
import { resolvePrompt, resolveThreadId, type AgentRunPayloadLike } from "./agent.payload.js";
import { AttachmentService } from "../attachment/attachment.service.js";
import { REDIS_MODULE_OPTIONS, type RedisModuleOptions } from "../infra/redis.constants.js";
import { RagRetrievalService } from "./rag-retrieval.service.js";

@Injectable()
export class AgentQueueProcessor implements OnModuleInit {
  private readonly logger = new Logger(AgentQueueProcessor.name);
  private worker: Worker | null = null;
  private subrunWorker: Worker | null = null;
  private attachmentWorker: Worker | null = null;

  constructor(
    private readonly db: DatabaseService,
    private readonly attachmentService: AttachmentService,
    private readonly ragRetrieval: RagRetrievalService,
    @Inject(REDIS_MODULE_OPTIONS) private readonly redisOptions: RedisModuleOptions
  ) {}

  onModuleInit() {
    const host = this.redisOptions.host;
    const port = this.redisOptions.port;
    this.worker = new Worker<AgentRunDto>(
      "agent-run",
      async (job: Job<AgentRunDto>) => {
        await this.handleJob(job);
      },
      {
        connection: { host, port },
        concurrency: 3
      }
    );

    this.worker.on("completed", (job) => {
      this.logger.log(`job=${job.id} completed`);
    });

    this.worker.on("failed", (job, err) => {
      this.logger.error(`job=${job?.id} failed: ${err.message}`);
    });

    this.logger.log("BullMQ worker started");

    this.subrunWorker = new Worker<SubagentRunDto, Record<string, unknown>>(
      "agent-subrun",
      async (job: Job<SubagentRunDto>) => {
        return this.handleSubrunJob(job);
      },
      {
        connection: { host, port },
        concurrency: 2
      }
    );

    this.subrunWorker.on("completed", (job) => {
      this.logger.log(`subrun job=${job.id} completed`);
    });

    this.subrunWorker.on("failed", (job, err) => {
      this.logger.error(`subrun job=${job?.id} failed: ${err.message}`);
    });

    this.attachmentWorker = new Worker<{ attachmentId: string }, Record<string, unknown>>(
      "attachment-process",
      async (job: Job<{ attachmentId: string }>) => {
        const attachmentId = job.data?.attachmentId;
        if (!attachmentId) {
          throw new Error("attachmentId is required");
        }
        await job.updateProgress(10);
        await this.attachmentService.processAttachmentJob(attachmentId);
        await job.updateProgress(100);
        return { attachmentId, status: "processed" };
      },
      {
        connection: { host, port },
        concurrency: 2
      }
    );

    this.attachmentWorker.on("completed", (job) => {
      this.logger.log(`attachment job=${job.id} completed`);
    });

    this.attachmentWorker.on("failed", (job, err) => {
      this.logger.error(`attachment job=${job?.id} failed: ${err.message}`);
    });
  }

  private async handleJob(job: Job<AgentRunDto>): Promise<void> {
    const payload = job.data as AgentRunPayloadLike;
    const threadId = resolveThreadId(payload, `thread-${job.id}-${Date.now()}`);
    const runId = `job-${job.id}-${Date.now()}`;
    const lastMessage = resolvePrompt(payload);
    if (!lastMessage) {
      throw new Error("job payload must include `messages` (non-empty) or `message`.");
    }
    const requestedProvider = payload.provider;
    const providerLabel = requestedProvider ?? process.env.AGENT_PROVIDER ?? "qwen";

    this.logger.log(`processing job=${job.id} threadId=${threadId} provider=${providerLabel}`);

    await job.updateProgress(10);
    const ragContext = await this.ragRetrieval.retrieve(lastMessage, threadId);

    const runtimeResult = await invokeAgent({
      prompt: lastMessage,
      threadId,
      systemContext: ragContext.systemContext,
      provider: requestedProvider,
      model: payload.model,
      metadata: { user_id: payload.userId, ...(payload.metadata ?? {}) },
      enabledSkills: payload.enabledSkills,
      runId,
      userId: payload.userId ?? null,
      prisma: this.db.getPrisma()
    });

    await job.updateProgress(80);

    await this.db.appendRunRecord({
      runId,
      threadId,
      userId: payload.userId ?? null,
      prompt: lastMessage,
      output: runtimeResult.output,
      provider: runtimeResult.provider,
      model: payload.model ?? null,
      checkpointId: runtimeResult.checkpointId ?? null
    });

    await job.updateProgress(100);

    this.logger.log(`job=${job.id} completed runId=${runId}`);
  }

  private async handleSubrunJob(job: Job<SubagentRunDto>): Promise<Record<string, unknown>> {
    const payload = job.data;
    const threadId = payload.threadId ?? payload.sessionId ?? `thread-${job.id}-${Date.now()}`;
    const runId = `subjob-${job.id}-${Date.now()}`;
    await job.updateProgress(10);

    const subrun = await invokeAgentSubrun({
      threadId,
      runId,
      prompt: payload.prompt,
      tasks: payload.tasks,
      provider: payload.provider,
      model: payload.model,
      metadata: { user_id: payload.userId, ...(payload.metadata ?? {}) },
      enabledSkills: payload.enabledSkills,
      maxConcurrency: payload.maxConcurrency,
      taskTimeoutMs: payload.taskTimeoutMs,
      roleModelOverrides: {
        planner: payload.planner,
        researcher: payload.researcher,
        coder: payload.coder
      },
      prisma: this.db.getPrisma()
    });

    await job.updateProgress(85);
    await this.db.appendSubagentRunRecord({
      runId: subrun.runId,
      threadId: subrun.threadId,
      prompt: payload.prompt ?? null,
      summary: subrun.summary,
      partial: subrun.partial,
      results: subrun.results as any
    });
    await job.updateProgress(100);
    this.logger.log(`subrun job=${job.id} completed runId=${subrun.runId}`);
    return subrun as unknown as Record<string, unknown>;
  }
}
