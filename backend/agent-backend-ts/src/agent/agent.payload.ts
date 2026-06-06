import type { AgentRunDto } from "./agent.dto.js";

type MessageLike = {
  content?: unknown;
};

export type AgentRunPayloadLike = Partial<AgentRunDto> & {
  message?: unknown;
  messages?: unknown;
};

export function resolveThreadId(payload: AgentRunPayloadLike, fallback: string): string {
  if (typeof payload.threadId === "string" && payload.threadId.trim().length > 0) {
    return payload.threadId;
  }
  if (typeof payload.sessionId === "string" && payload.sessionId.trim().length > 0) {
    return payload.sessionId;
  }
  return fallback;
}

function asMessageArray(input: unknown): MessageLike[] {
  if (!Array.isArray(input)) return [];
  return input.filter((item): item is MessageLike => typeof item === "object" && item !== null);
}

export function resolvePrompt(payload: AgentRunPayloadLike): string {
  const messages = asMessageArray(payload.messages);
  const last = messages.at(-1);
  if (last && typeof last.content === "string" && last.content.trim().length > 0) {
    return last.content;
  }

  if (typeof payload.message === "string" && payload.message.trim().length > 0) {
    return payload.message;
  }

  return "";
}
