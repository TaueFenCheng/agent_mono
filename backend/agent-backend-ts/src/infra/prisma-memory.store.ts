import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import type { MemoryFact, MemoryStore } from "@tang-agent/agent-core";

function nowIso(): string {
  return new Date().toISOString();
}

function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function toMemoryFact(row: {
  id: string;
  threadId: string;
  content: string;
  category: string;
  confidence: number;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}): MemoryFact {
  return {
    id: row.id,
    threadId: row.threadId,
    content: row.content,
    category: row.category,
    confidence: row.confidence,
    metadata: toRecord(row.metadata),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

export class PrismaMemoryStore implements MemoryStore {
  constructor(private readonly prisma: PrismaClient) {}

  async setup(): Promise<void> {
    // Schema is managed through Prisma migrations / db push.
  }

  async listFacts(threadId: string, options: { limit?: number } = {}): Promise<MemoryFact[]> {
    const rows = await this.prisma.agentMemoryFact.findMany({
      where: { threadId },
      orderBy: { createdAt: "desc" },
      take: options.limit ?? 50
    });
    return rows.map(toMemoryFact);
  }

  async createFact(
    threadId: string,
    input: { content: string; category?: string; confidence?: number; metadata?: Record<string, unknown> }
  ): Promise<MemoryFact> {
    const createdAt = nowIso();
    const row = await this.prisma.agentMemoryFact.create({
      data: {
        id: randomUUID(),
        threadId,
        content: input.content,
        category: input.category ?? "context",
        confidence: input.confidence ?? 0.7,
        metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
        createdAt,
        updatedAt: createdAt
      }
    });
    return toMemoryFact(row);
  }

  async deleteFact(threadId: string, factId: string): Promise<boolean> {
    const result = await this.prisma.agentMemoryFact.deleteMany({
      where: { id: factId, threadId }
    });
    return result.count > 0;
  }

  async renderPromptContext(threadId: string, options: { limit?: number } = {}): Promise<string> {
    const facts = await this.listFacts(threadId, options);
    if (facts.length === 0) return "";
    return ["Known memory facts:", ...facts.map((fact) => `- [${fact.category}] ${fact.content}`)].join("\n");
  }
}
