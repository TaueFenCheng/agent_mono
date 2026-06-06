import { NextResponse } from "next/server";

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

  if (!response.ok) {
    return NextResponse.json({ error: "upstream failed" }, { status: 502 });
  }

  const data = (await response.json()) as { output: string };
  return NextResponse.json({ output: data.output });
}
