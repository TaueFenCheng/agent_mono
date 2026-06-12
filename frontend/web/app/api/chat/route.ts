import { NextResponse } from "next/server";
import { getBackendBaseUrl, getBearerTokenFromRequest } from "../backend";

/**
 * POST /api/chat — 真正的 token 级流式
 * 后端 /v1/agents/runs/stream 返回 SSE
 * text_delta 事件逐 token 输出，run_end 事件结束
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
    const response = await fetch(`${baseUrl}/v1/agents/runs/stream`, {
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

    const reader = response.body?.getReader();
    if (!reader) {
      return new Response("", { status: 200 });
    }

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    let buffer = "";

    const stream = new ReadableStream({
      async start(controller) {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed || trimmed.startsWith(":")) continue;

              if (trimmed.startsWith("data: ")) {
                const jsonStr = trimmed.slice(6);
                try {
                  const event = JSON.parse(jsonStr) as {
                    type: string;
                    text?: string;
                    output?: string;
                    message?: string;
                  };

                  if (event.type === "text_delta" && event.text) {
                    // 逐 token 输出
                    controller.enqueue(encoder.encode(event.text));
                  } else if (event.type === "run_end" && event.output) {
                    // run_end 时如果没收到过 text_delta，用 output 兜底
                    // 已经流式输出过了就不再重复
                  } else if (event.type === "error") {
                    controller.enqueue(
                      encoder.encode(`\n[Error: ${event.message}]`)
                    );
                  }
                } catch {
                  // 非 JSON 行
                }
              }
            }
          }
        } catch (error) {
          controller.error(error);
        } finally {
          controller.close();
        }
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
