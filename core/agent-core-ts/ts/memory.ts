import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import type { MemoryFact, MemoryStore } from "./types";

function nowIso(): string {
  return new Date().toISOString();
}

function toMemoryFact(row: {
  id: string;
  thread_id: string;
  content: string;
  category: string;
  confidence: number;
  metadata: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
}): MemoryFact {
  return {
    id: row.id,
    threadId: row.thread_id,
    content: row.content,
    category: row.category,
    confidence: Number(row.confidence),
    metadata: row.metadata ?? {},
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString()
  };
}

export class InMemoryMemoryStore implements MemoryStore {
  private readonly facts = new Map<string, MemoryFact[]>();

  async listFacts(threadId: string, options: { limit?: number } = {}): Promise<MemoryFact[]> {
    const values = [...(this.facts.get(threadId) ?? [])].reverse();
    return values.slice(0, options.limit ?? 50);
  }

  async createFact(
    threadId: string,
    input: { content: string; category?: string; confidence?: number; metadata?: Record<string, unknown> }
  ): Promise<MemoryFact> {
    const timestamp = nowIso();
    const fact: MemoryFact = {
      id: randomUUID(),
      threadId,
      content: input.content,
      category: input.category ?? "context",
      confidence: input.confidence ?? 0.7,
      metadata: input.metadata ?? {},
      createdAt: timestamp,
      updatedAt: timestamp
    };
    this.facts.set(threadId, [...(this.facts.get(threadId) ?? []), fact]);
    return fact;
  }

  async deleteFact(threadId: string, factId: string): Promise<boolean> {
    const current = this.facts.get(threadId) ?? [];
    const next = current.filter((fact) => fact.id !== factId);
    this.facts.set(threadId, next);
    return next.length !== current.length;
  }

  async renderPromptContext(threadId: string, options: { limit?: number } = {}): Promise<string> {
    const facts = await this.listFacts(threadId, options);
    if (facts.length === 0) return "";
    return ["Known memory facts:", ...facts.map((fact) => `- [${fact.category}] ${fact.content}`)].join("\n");
  }
}

export class PostgresMemoryStore implements MemoryStore {
  constructor(private readonly pool: Pool) {}

  async setup(): Promise<void> {
    await this.pool.query(`
      create table if not exists agent_memory_facts (
        id text primary key,
        thread_id text not null,
        content text not null,
        category text not null default 'context',
        confidence double precision not null default 0.7,
        metadata jsonb not null default '{}'::jsonb,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      )
    `);
    await this.pool.query(
      "create index if not exists idx_agent_memory_thread_id on agent_memory_facts(thread_id, created_at desc)"
    );
  }

  async listFacts(threadId: string, options: { limit?: number } = {}): Promise<MemoryFact[]> {
    const result = await this.pool.query<{
      id: string;
      thread_id: string;
      content: string;
      category: string;
      confidence: number;
      metadata: Record<string, unknown> | null;
      created_at: Date;
      updated_at: Date;
    }>(
      `
        select id, thread_id, content, category, confidence, metadata, created_at, updated_at
        from agent_memory_facts
        where thread_id = $1
        order by created_at desc
        limit $2
      `,
      [threadId, options.limit ?? 50]
    );
    return result.rows.map(toMemoryFact);
  }

  async createFact(
    threadId: string,
    input: { content: string; category?: string; confidence?: number; metadata?: Record<string, unknown> }
  ): Promise<MemoryFact> {
    const factId = randomUUID();
    const timestamp = nowIso();
    const result = await this.pool.query<{
      id: string;
      thread_id: string;
      content: string;
      category: string;
      confidence: number;
      metadata: Record<string, unknown> | null;
      created_at: Date;
      updated_at: Date;
    }>(
      `
        insert into agent_memory_facts(id, thread_id, content, category, confidence, metadata, created_at, updated_at)
        values($1, $2, $3, $4, $5, $6::jsonb, $7::timestamptz, $7::timestamptz)
        returning id, thread_id, content, category, confidence, metadata, created_at, updated_at
      `,
      [
        factId,
        threadId,
        input.content,
        input.category ?? "context",
        input.confidence ?? 0.7,
        JSON.stringify(input.metadata ?? {}),
        timestamp
      ]
    );
    return toMemoryFact(result.rows[0]!);
  }

  async deleteFact(threadId: string, factId: string): Promise<boolean> {
    const result = await this.pool.query("delete from agent_memory_facts where thread_id = $1 and id = $2", [threadId, factId]);
    return (result.rowCount ?? 0) > 0;
  }

  async renderPromptContext(threadId: string, options: { limit?: number } = {}): Promise<string> {
    const facts = await this.listFacts(threadId, options);
    if (facts.length === 0) return "";
    return ["Known memory facts:", ...facts.map((fact) => `- [${fact.category}] ${fact.content}`)].join("\n");
  }
}
