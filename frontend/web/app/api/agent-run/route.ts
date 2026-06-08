import { NextResponse } from "next/server";
import { getBackendBaseUrl, getBearerTokenFromRequest } from "../backend";

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
    response = await fetch(`${baseUrl}/v1/agents/runs`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
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
