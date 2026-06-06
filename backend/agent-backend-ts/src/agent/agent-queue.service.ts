import { Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { Queue } from "bullmq";
import type { AgentRunDto } from "./agent.dto.js";
import type { SubagentRunDto } from "../subagent/subagent.dto.js";
import { REDIS_MODULE_OPTIONS, type RedisModuleOptions } from "../infra/redis.constants.js";

@Injectable()
export class AgentQueueService {
  private readonly logger = new Logger(AgentQueueService.name);
  private readonly queue: Queue;
  private readonly subrunQueue: Queue;
  private readonly attachmentQueue: Queue;

  constructor(@Inject(REDIS_MODULE_OPTIONS) options: RedisModuleOptions) {
    const host = options.host;
    const port = options.port;
    this.queue = new Queue("agent-run", { connection: { host, port } });
    this.subrunQueue = new Queue("agent-subrun", { connection: { host, port } });
    this.attachmentQueue = new Queue("attachment-process", { connection: { host, port } });
  }

  async submitRun(payload: AgentRunDto): Promise<{ jobId: string; status: string }> {
    const job = await this.queue.add(
      "agent-run",
      { ...payload, submittedAt: new Date().toISOString() },
      {
        removeOnComplete: 50,
        removeOnFail: 100
      }
    );

    this.logger.log(`job submitted: ${job.id}`);
    return { jobId: String(job.id), status: "queued" };
  }

  async submitSubrun(payload: SubagentRunDto): Promise<{ jobId: string; status: string }> {
    const job = await this.subrunQueue.add(
      "agent-subrun",
      { ...payload, submittedAt: new Date().toISOString() },
      {
        removeOnComplete: 50,
        removeOnFail: 100
      }
    );

    this.logger.log(`subrun job submitted: ${job.id}`);
    return { jobId: String(job.id), status: "queued" };
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
    const job = await this.queue.getJob(jobId);
    if (!job) throw new NotFoundException(`Job not found: ${jobId}`);

    return {
      jobId: String(job.id),
      status: (await job.getState()) ?? "unknown",
      progress: job.progress as number | undefined,
      result: (job.returnvalue as Record<string, unknown> | undefined) ?? null,
      failedReason: job.failedReason ?? null,
      createdAt: job.timestamp ? new Date(job.timestamp).toISOString() : null,
      finishedAt: job.finishedOn ? new Date(job.finishedOn).toISOString() : null
    };
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
    const job = await this.subrunQueue.getJob(jobId);
    if (!job) throw new NotFoundException(`Subrun job not found: ${jobId}`);

    return {
      jobId: String(job.id),
      status: (await job.getState()) ?? "unknown",
      progress: job.progress as number | undefined,
      result: (job.returnvalue as Record<string, unknown> | undefined) ?? null,
      failedReason: job.failedReason ?? null,
      createdAt: job.timestamp ? new Date(job.timestamp).toISOString() : null,
      finishedAt: job.finishedOn ? new Date(job.finishedOn).toISOString() : null
    };
  }

  async submitAttachmentProcessJob(attachmentId: string): Promise<{ jobId: string; status: string }> {
    const job = await this.attachmentQueue.add(
      "attachment-process",
      { attachmentId, submittedAt: new Date().toISOString() },
      {
        removeOnComplete: 100,
        removeOnFail: 200
      }
    );

    this.logger.log(`attachment job submitted: ${job.id} attachmentId=${attachmentId}`);
    return { jobId: String(job.id), status: "queued" };
  }

  async getAttachmentJobStatus(jobId: string): Promise<{
    jobId: string;
    status: string;
    progress?: number;
    result?: Record<string, unknown> | null;
    failedReason?: string | null;
    createdAt?: string | null;
    finishedAt?: string | null;
  }> {
    const job = await this.attachmentQueue.getJob(jobId);
    if (!job) throw new NotFoundException(`Attachment job not found: ${jobId}`);

    return {
      jobId: String(job.id),
      status: (await job.getState()) ?? "unknown",
      progress: job.progress as number | undefined,
      result: (job.returnvalue as Record<string, unknown> | undefined) ?? null,
      failedReason: job.failedReason ?? null,
      createdAt: job.timestamp ? new Date(job.timestamp).toISOString() : null,
      finishedAt: job.finishedOn ? new Date(job.finishedOn).toISOString() : null
    };
  }
}
