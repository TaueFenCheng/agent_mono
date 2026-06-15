import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma } from "@prisma/client";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { DatabaseService } from "../infra/database.service.js";
import { AgentQueueService } from "../agent/agent-queue.service.js";
import { AttachmentStorageService } from "./attachment.storage.js";
import { chunkText, parseAttachment } from "./attachment.parser.js";
import type { UploadAttachmentDto } from "./attachment.dto.js";
import { AttachmentTaskDispatcherService } from "./attachment-task-dispatcher.service.js";
import { normalizeUploadFileName } from "./attachment-file-name.js";

function normalizeMeta(metadata?: string): Record<string, unknown> {
  if (!metadata || !metadata.trim()) return {};
  try {
    const parsed = JSON.parse(metadata);
    return typeof parsed === "object" && parsed ? (parsed as Record<string, unknown>) : {};
  } catch {
    return { raw: metadata };
  }
}

function asJsonValue(value: Record<string, unknown>): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function buildObjectKey(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();
  const day = new Date().toISOString().slice(0, 10);
  return `attachments/${day}/${randomUUID()}${ext}`;
}

@Injectable()
export class AttachmentService {
  private readonly maxUploadMb: number;
  private readonly chunkMaxChars: number;
  private readonly ocrLang: string;

  constructor(
    private readonly db: DatabaseService,
    private readonly queue: AgentQueueService,
    private readonly storage: AttachmentStorageService,
    private readonly taskDispatcher: AttachmentTaskDispatcherService,
    @Inject(ConfigService) private readonly configService: ConfigService
  ) {
    this.maxUploadMb = Math.max(1, this.configService.get<number>("attachment.maxUploadMb") ?? 25);
    this.chunkMaxChars = Math.max(200, this.configService.get<number>("attachment.chunkMaxChars") ?? 1200);
    this.ocrLang = this.configService.get<string>("attachment.ocrLang") ?? "eng+chi_sim";
  }

  private toResponse(record: {
    id: string;
    threadId: string | null;
    runId: string | null;
    fileName: string;
    contentType: string;
    sizeBytes: number;
    status: string;
    parser: string | null;
    error: string | null;
    createdAt: Date;
    updatedAt: Date;
    objectKey: string;
    metadata: unknown;
    textContent?: string | null;
    chunks?: Array<{ chunkIndex: number; content: string; tokenCount: number }>;
  }) {
    return {
      id: record.id,
      objectKey: record.objectKey,
      threadId: record.threadId,
      runId: record.runId,
      fileName: record.fileName,
      contentType: record.contentType,
      sizeBytes: record.sizeBytes,
      status: record.status,
      parser: record.parser,
      error: record.error,
      metadata: record.metadata,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
      previewUrl: undefined as string | undefined,
      textPreview: record.textContent?.slice(0, 4000) ?? null,
      chunks: record.chunks
    };
  }

  private stripObjectKey<T extends { objectKey: string }>(item: T): Omit<T, "objectKey"> {
    const { objectKey: _, ...rest } = item;
    return rest;
  }

  private async withPreviewUrl<T extends { objectKey: string; previewUrl?: string }>(item: T): Promise<T> {
    const previewUrl = await this.storage.getSignedDownloadUrl(item.objectKey);
    return { ...item, previewUrl };
  }

  async uploadAttachment(file: { originalname: string; mimetype: string; size: number; buffer: Buffer }, payload: UploadAttachmentDto) {
    if (!file || !file.buffer || file.size <= 0) {
      throw new BadRequestException("Missing upload file");
    }

    const fileName = normalizeUploadFileName(file.originalname);
    const maxBytes = this.maxUploadMb * 1024 * 1024;
    if (file.size > maxBytes) {
      throw new BadRequestException(`File too large. max=${this.maxUploadMb}MB`);
    }

    const objectKey = buildObjectKey(fileName);
    const contentType = file.mimetype || "application/octet-stream";
    const sha256 = createHash("sha256").update(file.buffer).digest("hex");
    await this.storage.uploadObject({ key: objectKey, body: file.buffer, contentType });

    const prisma = this.db.getPrisma();
    const created = await prisma.attachment.create({
      data: {
        threadId: payload.threadId ?? null,
        runId: payload.runId ?? null,
        fileName,
        contentType,
        sizeBytes: file.size,
        storageProvider: "s3",
        bucket: this.storage.getBucket(),
        objectKey,
        sha256,
        metadata: asJsonValue(normalizeMeta(payload.metadata)),
        status: "uploaded"
      }
    });

    const job = await this.queue.submitAttachmentProcessJob(created.id);
    const response = await this.withPreviewUrl(this.toResponse(created));
    return { ...this.stripObjectKey(response), jobId: job.jobId, jobStatus: job.status };
  }

  async processAttachmentJob(attachmentId: string): Promise<void> {
    const prisma = this.db.getPrisma();
    const attachment = await prisma.attachment.findUnique({ where: { id: attachmentId } });
    if (!attachment) {
      throw new NotFoundException(`Attachment not found: ${attachmentId}`);
    }

    await prisma.attachment.update({
      where: { id: attachmentId },
      data: { status: "processing", error: null }
    });

    try {
      const buffer = await this.storage.downloadObject(attachment.objectKey);
      const parsed = await parseAttachment({
        buffer,
        contentType: attachment.contentType,
        fileName: attachment.fileName,
        ocrLang: this.ocrLang
      });
      const chunks = chunkText(parsed.text, this.chunkMaxChars);

      await prisma.$transaction(async (tx) => {
        await tx.attachment.update({
          where: { id: attachmentId },
          data: {
            status: "processed",
            parser: parsed.parser,
            textContent: parsed.text,
            error: null,
            metadata: asJsonValue({
              ...(attachment.metadata as Record<string, unknown>),
              parserMetadata: parsed.metadata,
              extractedAt: new Date().toISOString(),
              chunkCount: chunks.length
            })
          }
        });

        await tx.attachmentChunk.deleteMany({ where: { attachmentId } });
        if (chunks.length > 0) {
          await tx.attachmentChunk.createMany({
            data: chunks.map((item) => ({
              attachmentId,
              threadId: attachment.threadId,
              chunkIndex: item.chunkIndex,
              content: item.content,
              tokenCount: item.tokenCount
            }))
          });
        }
      });

      await this.taskDispatcher.onAttachmentProcessed(attachmentId);
    } catch (error) {
      await prisma.attachment.update({
        where: { id: attachmentId },
        data: {
          status: "failed",
          error: error instanceof Error ? error.message : String(error)
        }
      });
      throw error;
    }
  }

  async getAttachment(attachmentId: string) {
    const prisma = this.db.getPrisma();
    const row = await prisma.attachment.findUnique({
      where: { id: attachmentId },
      include: {
        chunks: {
          orderBy: { chunkIndex: "asc" },
          take: 20
        }
      }
    });

    if (!row) {
      throw new NotFoundException("Attachment not found");
    }

    const response = await this.withPreviewUrl(
      this.toResponse({
        ...row,
        chunks: row.chunks.map((item) => ({
          chunkIndex: item.chunkIndex,
          content: item.content,
          tokenCount: item.tokenCount
        }))
      })
    );
    return this.stripObjectKey(response);
  }

  async listAttachments(input: { threadId?: string; limit?: number }) {
    const limit = Math.min(Math.max(input.limit ?? 20, 1), 100);
    const prisma = this.db.getPrisma();
    const rows = await prisma.attachment.findMany({
      where: {
        threadId: input.threadId ?? undefined
      },
      orderBy: { createdAt: "desc" },
      take: limit
    });

    const items = await Promise.all(
      rows.map(async (row) => this.stripObjectKey(await this.withPreviewUrl(this.toResponse(row))))
    );
    return { attachments: items };
  }

  async searchAttachments(input: { query: string; threadId?: string; limit?: number }) {
    const query = input.query.trim();
    if (!query) {
      throw new BadRequestException("Query cannot be empty");
    }

    const limit = Math.min(Math.max(input.limit ?? 20, 1), 100);
    const prisma = this.db.getPrisma();
    const rows = await prisma.attachment.findMany({
      where: {
        threadId: input.threadId ?? undefined,
        OR: [
          { fileName: { contains: query, mode: "insensitive" } },
          { textContent: { contains: query, mode: "insensitive" } },
          {
            chunks: {
              some: {
                content: { contains: query, mode: "insensitive" }
              }
            }
          }
        ]
      },
      include: {
        chunks: {
          orderBy: { chunkIndex: "asc" },
          take: 3,
          where: {
            content: { contains: query, mode: "insensitive" }
          }
        }
      },
      orderBy: { updatedAt: "desc" },
      take: limit
    });

    const items = await Promise.all(
      rows.map((row) =>
        this.withPreviewUrl(
          this.toResponse({
            ...row,
            chunks: row.chunks.map((item) => ({
              chunkIndex: item.chunkIndex,
              content: item.content,
              tokenCount: item.tokenCount
            }))
          })
        ).then((item) => this.stripObjectKey(item))
      )
    );

    return { query, total: items.length, attachments: items };
  }

  async getAttachmentJobStatus(jobId: string) {
    return this.queue.getAttachmentJobStatus(jobId);
  }
}
