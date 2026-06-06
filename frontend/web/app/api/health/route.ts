import { NextResponse } from "next/server";

export async function GET() {
  const baseUrl = process.env.NEXT_PUBLIC_AGENT_API_BASE_URL ?? "http://127.0.0.1:8080";

  try {
    const response = await fetch(`${baseUrl}/health`, {
      method: "GET",
      headers: { "content-type": "application/json" }
    });

    const data = (await response.json()) as Record<string, unknown>;
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    return NextResponse.json(
      {
        code: 502,
        message: error instanceof Error ? error.message : "upstream health failed",
        data: null
      },
      { status: 502 }
    );
  }
}
