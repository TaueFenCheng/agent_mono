import { NextResponse } from "next/server";

interface AgentRunResponseEnvelope {
  code: number | string;
  message: string;
  data: {
    output: string;
  } | null;
}

export async function POST(req: Request) {
  const payload = (await req.json()) as { message: string; threadId?: string };
  const baseUrl = process.env.NEXT_PUBLIC_AGENT_API_BASE_URL ?? "http://127.0.0.1:8080";

  const response = await fetch(`${baseUrl}/v1/agents/runs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      threadId: payload.threadId || `web-${Date.now()}`,
      messages: [{ role: "user", content: payload.message, createdAt: new Date().toISOString() }]
    })
  });

  const result = (await response.json()) as AgentRunResponseEnvelope | Record<string, unknown>;

  if (!response.ok) {
    return NextResponse.json(result, { status: response.status || 502 });
  }

  if (!("code" in result) || result.code !== 0 || !("data" in result) || !result.data) {
    return NextResponse.json(
      {
        code: 502,
        message: "upstream returned invalid payload",
        data: null
      },
      { status: 502 }
    );
  }

  return NextResponse.json({ output: result.data.output });
}
