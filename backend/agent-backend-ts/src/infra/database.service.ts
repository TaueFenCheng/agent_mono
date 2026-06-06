import { Inject, Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import type { RunRecordResponse, SubagentResult, SubagentRunRecordResponse } from "@tang-agent/core-types";
import { DATABASE_MODULE_OPTIONS, type DatabaseModuleOptions } from "./database.constants.js";

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private readonly prisma: PrismaClient;

  constructor(@Inject(DATABASE_MODULE_OPTIONS) private readonly options: DatabaseModuleOptions) {
    this.prisma = new PrismaClient({
      datasources: {
        db: {
          url: this.options.url
        }
      }
    });
  }

  async health(): Promise<"up" | "down"> {
    try {
      await this.prisma.$queryRawUnsafe("select 1");
      return "up";
    } catch (error) {
      this.logger.warn(`postgres down: ${String(error)}`);
      return "down";
    }
  }

  async appendRunRecord(input: {
    runId: string;
    threadId: string;
    prompt: string;
    output: string;
    provider: string;
    model?: string | null;
    checkpointId?: string | null;
  }): Promise<void> {
    await this.prisma.agentRun.upsert({
      where: { runId: input.runId },
      update: {},
      create: {
        runId: input.runId,
        threadId: input.threadId,
        prompt: input.prompt,
        output: input.output,
        provider: input.provider,
        model: input.model ?? null,
        checkpointId: input.checkpointId ?? null
      }
    });
  }

  async getRun(runId: string): Promise<RunRecordResponse | null> {
    const row = await this.prisma.agentRun.findUnique({ where: { runId } });
    if (!row) return null;
    return {
      runId: row.runId,
      threadId: row.threadId,
      prompt: row.prompt,
      output: row.output,
      provider: row.provider,
      model: row.model,
      checkpointId: row.checkpointId,
      createdAt: row.createdAt.toISOString()
    };
  }

  async appendSubagentRunRecord(input: {
    runId: string;
    threadId: string;
    prompt?: string | null;
    summary: string;
    partial: boolean;
    results: SubagentResult[];
  }): Promise<void> {
    await this.prisma.subagentRun.upsert({
      where: { runId: input.runId },
      update: {
        prompt: input.prompt ?? null,
        summary: input.summary,
        partial: input.partial
      },
      create: {
        runId: input.runId,
        threadId: input.threadId,
        prompt: input.prompt ?? null,
        summary: input.summary,
        partial: input.partial
      }
    });

    await this.prisma.subagentTaskRun.deleteMany({ where: { runId: input.runId } });
    if (input.results.length > 0) {
      await this.prisma.subagentTaskRun.createMany({
        data: input.results.map((item) => ({
          runId: input.runId,
          taskId: item.taskId,
          role: item.role,
          status: item.status,
          threadId: item.threadId,
          provider: item.provider ?? null,
          model: item.model ?? null,
          output: item.output ?? null,
          error: item.error ?? null,
          checkpointId: item.checkpointId ?? null,
          startedAt: new Date(item.startedAt),
          endedAt: new Date(item.endedAt),
          durationMs: item.durationMs
        }))
      });
    }
  }

  async getSubagentRun(runId: string): Promise<SubagentRunRecordResponse | null> {
    const run = await this.prisma.subagentRun.findUnique({
      where: { runId },
      include: { taskRuns: { orderBy: { createdAt: "asc" } } }
    });
    if (!run) return null;
    return {
      runId: run.runId,
      threadId: run.threadId,
      prompt: run.prompt,
      summary: run.summary,
      partial: run.partial,
      createdAt: run.createdAt.toISOString(),
      results: run.taskRuns.map((item) => ({
        taskId: item.taskId,
        role: item.role as any,
        status: item.status as any,
        threadId: item.threadId,
        provider: item.provider,
        model: item.model,
        output: item.output,
        error: item.error,
        startedAt: item.startedAt.toISOString(),
        endedAt: item.endedAt.toISOString(),
        durationMs: item.durationMs,
        checkpointId: item.checkpointId
      }))
    };
  }

  getPrisma(): PrismaClient {
    return this.prisma;
  }

  async onModuleDestroy() {
    await this.prisma.$disconnect();
  }
}
