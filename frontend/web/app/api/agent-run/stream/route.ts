import { NextResponse } from "next/server";
import { getBackendBaseUrl, getBearerTokenFromRequest } from "../../backend";

export async function POST(req: Request) {
  const payload = (await req.json()) as { message: string; threadId?: string; provider?: string; model?: string };
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

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/v1/agents/runs/stream`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "text/event-stream",
        authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify({
        threadId: payload.threadId || `web-${Date.now()}`,
        messages: [{ role: "user", content: payload.message, createdAt: new Date().toISOString() }],
        ...(payload.provider && { provider: payload.provider }),
        ...(payload.model && { model: payload.model })
      })
    });
  } catch (error) {
    return NextResponse.json(
      {
        code: 502,
        message: error instanceof Error ? error.message : "backend agent stream request failed",
        data: null
      },
      { status: 502 }
    );
  }

  if (!response.ok) {
    const result = (await response.json().catch(() => ({
      code: response.status,
      message: "upstream stream request failed",
      data: null
    }))) as Record<string, unknown>;
    return NextResponse.json(result, { status: response.status || 502 });
  }

  if (!response.body) {
    return NextResponse.json(
      {
        code: 502,
        message: "upstream returned empty stream body",
        data: null
      },
      { status: 502 }
    );
  }

  return new Response(response.body, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
      Connection: "keep-alive"
    }
  });
}
