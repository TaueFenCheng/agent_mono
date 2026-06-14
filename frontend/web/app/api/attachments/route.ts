import { type NextRequest, NextResponse } from "next/server";
import { getBackendBaseUrl, getBearerTokenFromRequest } from "../backend";

function authorizationHeaders(req: NextRequest) {
  const token = getBearerTokenFromRequest(req);
  return token ? ({ Authorization: `Bearer ${token}` } as Record<string, string>) : {};
}

export async function GET(req: NextRequest) {
  const baseUrl = getBackendBaseUrl();
  const search = new URL(req.url).searchParams;

  try {
    const response = await fetch(`${baseUrl}/v1/attachments?${search.toString()}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        ...authorizationHeaders(req)
      } satisfies Record<string, string>,
      cache: "no-store"
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    return NextResponse.json(
      {
        code: 502,
        message: error instanceof Error ? error.message : "attachment list request failed",
        data: null
      },
      { status: 502 }
    );
  }
}

export async function POST(req: NextRequest) {
  const baseUrl = getBackendBaseUrl();

  try {
    const incoming = await req.formData();
    const outgoing = new FormData();

    for (const [key, value] of incoming.entries()) {
      outgoing.append(key, value);
    }

    const response = await fetch(`${baseUrl}/v1/attachments`, {
      method: "POST",
      headers: authorizationHeaders(req),
      body: outgoing
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    return NextResponse.json(
      {
        code: 502,
        message: error instanceof Error ? error.message : "attachment upload request failed",
        data: null
      },
      { status: 502 }
    );
  }
}
