import { AIMessage, HumanMessage, SystemMessage, ToolMessage, type BaseMessage } from "@langchain/core/messages";
import type { RunnableConfig } from "@langchain/core/runnables";
import { BaseCheckpointSaver, MemorySaver } from "@langchain/langgraph";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import type { ThreadCheckpoint, ThreadDetail, ThreadSummary } from "./types";

export interface CheckpointerManager {
  kind: "memory" | "postgres";
  saver: BaseCheckpointSaver;
  close(): Promise<void>;
}

function stringifyContent(content: unknown): string {
  if (typeof content === "string") return content;
  return JSON.stringify(content);
}

export function serializeMessage(message: BaseMessage): Record<string, unknown> {
  let role = "unknown";
  if (message instanceof HumanMessage) role = "user";
  else if (message instanceof AIMessage) role = "assistant";
  else if (message instanceof SystemMessage) role = "system";
  else if (message instanceof ToolMessage) role = "tool";

  return {
    role,
    content: stringifyContent(message.content),
    type: message.constructor.name
  };
}

function normalizeThreadConfig(threadId?: string): RunnableConfig {
  return { configurable: threadId ? { thread_id: threadId } : {} };
}

export async function createCheckpointerManager(input: {
  backend?: string;
  connectionString?: string;
}): Promise<CheckpointerManager> {
  const selected = (input.backend ?? process.env.AGENT_CHECKPOINTER_BACKEND ?? (input.connectionString ? "postgres" : "memory"))
    .trim()
    .toLowerCase();

  if (selected === "postgres") {
    if (!input.connectionString) {
      throw new Error("A postgres connection string is required for the postgres checkpointer backend.");
    }
    const saver = PostgresSaver.fromConnString(input.connectionString);
    await saver.setup();
    return {
      kind: "postgres",
      saver,
      close: async () => {
        await saver.end();
      }
    };
  }

  return {
    kind: "memory",
    saver: new MemorySaver(),
    close: async () => {}
  };
}

export async function listThreads(checkpointer: BaseCheckpointSaver, limit = 20): Promise<ThreadSummary[]> {
  const threadInfoMap = new Map<string, ThreadSummary>();

  for await (const checkpoint of checkpointer.list(normalizeThreadConfig(), { limit })) {
    const configurable = (checkpoint.config.configurable ?? {}) as Record<string, unknown>;
    const threadId = typeof configurable.thread_id === "string" ? configurable.thread_id : undefined;
    if (!threadId) continue;

    const ts = checkpoint.checkpoint.ts;
    const checkpointId = typeof configurable.checkpoint_id === "string" ? configurable.checkpoint_id : null;
    const channelValues = checkpoint.checkpoint.channel_values as Record<string, unknown>;

    const existing = threadInfoMap.get(threadId);
    if (!existing) {
      threadInfoMap.set(threadId, {
        thread_id: threadId,
        created_at: ts,
        updated_at: ts,
        latest_checkpoint_id: checkpointId,
        title: typeof channelValues.title === "string" ? channelValues.title : null
      });
      continue;
    }

    if (ts && (!existing.created_at || ts < existing.created_at)) {
      existing.created_at = ts;
    }
    if (ts && (!existing.updated_at || ts > existing.updated_at)) {
      existing.updated_at = ts;
      existing.latest_checkpoint_id = checkpointId;
      existing.title = typeof channelValues.title === "string" ? channelValues.title : null;
    }
  }

  return [...threadInfoMap.values()].sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? "")).slice(0, limit);
}

export async function getThreadCheckpoints(checkpointer: BaseCheckpointSaver, threadId: string): Promise<ThreadCheckpoint[]> {
  const config = normalizeThreadConfig(threadId);
  const checkpoints: ThreadCheckpoint[] = [];

  for await (const checkpoint of checkpointer.list(config)) {
    const configurable = (checkpoint.config.configurable ?? {}) as Record<string, unknown>;
    const parentConfigurable = (checkpoint.parentConfig?.configurable ?? {}) as Record<string, unknown>;
    const values = { ...(checkpoint.checkpoint.channel_values as Record<string, unknown>) };

    if (Array.isArray(values.messages)) {
      values.messages = values.messages.map((message) => {
        if (message instanceof HumanMessage || message instanceof AIMessage || message instanceof SystemMessage || message instanceof ToolMessage) {
          return serializeMessage(message);
        }
        return message;
      });
    }

    checkpoints.push({
      checkpoint_id: typeof configurable.checkpoint_id === "string" ? configurable.checkpoint_id : null,
      parent_checkpoint_id: typeof parentConfigurable.checkpoint_id === "string" ? parentConfigurable.checkpoint_id : null,
      ts: checkpoint.checkpoint.ts,
      metadata: (checkpoint.metadata as Record<string, unknown> | undefined) ?? {},
      values,
      pending_writes: (checkpoint.pendingWrites ?? []).map(([taskId, channel, value]) => ({
        task_id: taskId,
        channel,
        value
      }))
    });
  }

  return checkpoints.sort((a, b) => (a.ts ?? "").localeCompare(b.ts ?? ""));
}

export async function getLatestCheckpointId(checkpointer: BaseCheckpointSaver, threadId: string): Promise<string | null> {
  const checkpoints = await getThreadCheckpoints(checkpointer, threadId);
  return checkpoints.at(-1)?.checkpoint_id ?? null;
}

export async function getThread(checkpointer: BaseCheckpointSaver, threadId: string): Promise<ThreadDetail> {
  return {
    thread_id: threadId,
    checkpoints: await getThreadCheckpoints(checkpointer, threadId)
  };
}
