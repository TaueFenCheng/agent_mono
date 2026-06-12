import { NextResponse } from "next/server";
import { getBackendBaseUrl, getBearerTokenFromRequest } from "../backend";

/**
 * POST /api/chat — Vercel AI SDK v6 useChat 兼容端点
 * 接收 UIMessage[] 格式，代理到后端 /v1/agents/runs
 * 返回 text/plain 流式格式
 */
export async function POST(req: Request) {
  const body = (await req.json()) as {
    messages?: Array<{
      role: string;
      content?: string;
      parts?: Array<{ type: string; text?: string }>;
    }>;
    threadId?: string;
    provider?: string;
    model?: string;
  };

  const baseUrl = getBackendBaseUrl();
  const accessToken = getBearerTokenFromRequest(req);

  if (!accessToken) {
    return NextResponse.json(
      { error: "Missing bearer token" },
      { status: 401 }
    );
  }

  // 从最后一条用户消息提取文本（兼容 v5 content 和 v6 parts 格式）
  const lastUserMessage = body.messages?.filter((m) => m.role === "user").pop();
  const lastMessage = lastUserMessage
    ? lastUserMessage.content ??
      lastUserMessage.parts
        ?.filter((p) => p.type === "text")
        .map((p) => p.text ?? "")
        .join("") ??
      ""
    : "";

  const threadId = body.threadId || `chat-${Date.now()}`;

  try {
    const response = await fetch(`${baseUrl}/v1/agents/runs`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        threadId,
        messages: [
          {
            role: "user",
            content: lastMessage,
            createdAt: new Date().toISOString(),
          },
        ],
        ...(body.provider && { provider: body.provider }),
        ...(body.model && { model: body.model }),
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return new Response(errorText || `Backend error ${response.status}`, {
        status: response.status,
      });
    }

    const result = (await response.json()) as {
      code?: number;
      data?: { output?: string };
    };
    const output = result.data?.output ?? "";

    // 返回 text/plain 流式格式（TextStreamChatTransport 兼容）
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(output));
        controller.close();
      },
    });

    return new Response(stream, {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "backend request failed",
      },
      { status: 502 }
    );
  }
}
