import { NextResponse } from "next/server";

interface AgentRunResponseEnvelope {
  code: number | string;
  message: string;
  data: {
    output: string;
  } | null;
}

type SuccessfulAgentRunResponseEnvelope = AgentRunResponseEnvelope & {
  code: 0;
  data: {
    output: string;
  };
};

function isAgentRunResponseEnvelope(value: unknown): value is SuccessfulAgentRunResponseEnvelope {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { code?: unknown; data?: unknown };
  if (candidate.code !== 0) return false;
  if (!candidate.data || typeof candidate.data !== "object") return false;
  return typeof (candidate.data as { output?: unknown }).output === "string";
}

export async function POST(req: Request) {
  const payload = (await req.json()) as { message: string; threadId?: string };
  const baseUrl = process.env.NEXT_PUBLIC_AGENT_API_BASE_URL ?? "http://127.0.0.1:8080";

  let accessToken = "";
  try {
    const tokenResponse = await fetch(`${baseUrl}/v1/auth/token`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sub: "web-console",
        name: "Web Console",
        roles: ["user"]
      })
    });

    const tokenResult = (await tokenResponse.json()) as { data?: { accessToken?: unknown } };
    if (!tokenResponse.ok || typeof tokenResult.data?.accessToken !== "string") {
      return NextResponse.json(
        {
          code: tokenResponse.status || 502,
          message: "failed to create backend access token",
          data: tokenResult
        },
        { status: tokenResponse.status || 502 }
      );
    }
    accessToken = tokenResult.data.accessToken;
  } catch (error) {
    return NextResponse.json(
      {
        code: 502,
        message: error instanceof Error ? error.message : "backend auth request failed",
        data: null
      },
      { status: 502 }
    );
  }

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/v1/agents/runs`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify({
        threadId: payload.threadId || `web-${Date.now()}`,
        messages: [{ role: "user", content: payload.message, createdAt: new Date().toISOString() }]
      })
    });
  } catch (error) {
    return NextResponse.json(
      {
        code: 502,
        message: error instanceof Error ? error.message : "backend agent request failed",
        data: null
      },
      { status: 502 }
    );
  }

  const result = (await response.json()) as AgentRunResponseEnvelope | Record<string, unknown>;

  if (!response.ok) {
    return NextResponse.json(result, { status: response.status || 502 });
  }

  if (!isAgentRunResponseEnvelope(result)) {
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
