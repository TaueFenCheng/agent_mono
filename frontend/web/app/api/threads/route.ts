import { NextResponse } from "next/server";
import { getBackendBaseUrl, getBearerTokenFromRequest } from "../backend";

type MessageRole = "user" | "assistant" | "tool" | "system";

interface BackendEnvelope<T> {
  code: number | string;
  message: string;
  data: T;
}

interface BackendThreadSummary {
  thread_id: string;
  created_at?: string | null;
  updated_at?: string | null;
  title?: string | null;
}

interface BackendThreadCheckpoint {
  checkpoint_id?: string | null;
  ts?: string | null;
  values?: {
    messages?: Array<{
      role?: MessageRole;
      content?: string;
      type?: string;
    }>;
  };
}

interface BackendThreadDetail {
  thread_id: string;
  checkpoints: BackendThreadCheckpoint[];
}

function asMessageRole(role: unknown): "user" | "assistant" | null {
  return role === "user" || role === "assistant" ? role : null;
}

function titleFromMessages(messages: Array<{ role: "user" | "assistant"; content: string }>, fallback: string) {
  const firstUserMessage = messages.find((message) => message.role === "user" && message.content.trim());
  return firstUserMessage?.content.trim().slice(0, 24) || fallback;
}

function latestMessages(detail: BackendThreadDetail) {
  for (let index = detail.checkpoints.length - 1; index >= 0; index -= 1) {
    const messages = detail.checkpoints[index]?.values?.messages;
    if (Array.isArray(messages) && messages.length > 0) return messages;
  }
  return [];
}

async function fetchJson<T>(url: string, accessToken: string) {
  const response = await fetch(url, {
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${accessToken}`
    },
    cache: "no-store"
  });
  const result = (await response.json()) as BackendEnvelope<T>;
  if (!response.ok) {
    throw new Error(result.message || `upstream returned ${response.status}`);
  }
  return result.data;
}

export async function GET(req: Request) {
  const baseUrl = getBackendBaseUrl();
  const accessToken = getBearerTokenFromRequest(req);

  if (!accessToken) {
    return NextResponse.json(
      {
        code: 401,
        message: "Missing bearer token",
        data: null
      },
      { status: 401 }
    );
  }

  try {
    const threadList = await fetchJson<{ thread_list: BackendThreadSummary[] }>(
      `${baseUrl}/v1/threads?limit=30`,
      accessToken
    );

    const sessions = await Promise.all(
      threadList.thread_list.map(async (thread) => {
        const detail = await fetchJson<BackendThreadDetail>(
          `${baseUrl}/v1/threads/${encodeURIComponent(thread.thread_id)}`,
          accessToken
        );
        const messages = latestMessages(detail)
          .map((message, index) => {
            const role = asMessageRole(message.role);
            const content = typeof message.content === "string" ? message.content : "";
            if (!role || !content.trim()) return null;
            return {
              id: `${thread.thread_id}-${index}`,
              role,
              content,
              createdAt: thread.updated_at ?? thread.created_at ?? new Date().toISOString()
            };
          })
          .filter((message): message is NonNullable<typeof message> => Boolean(message));

        return {
          id: thread.thread_id,
          title: thread.title?.trim() || titleFromMessages(messages, thread.thread_id),
          updatedAt: thread.updated_at ?? thread.created_at ?? new Date().toISOString(),
          messages
        };
      })
    );

    return NextResponse.json({ sessions });
  } catch (error) {
    return NextResponse.json(
      {
        code: 502,
        message: error instanceof Error ? error.message : "failed to load threads",
        data: null
      },
      { status: 502 }
    );
  }
}
