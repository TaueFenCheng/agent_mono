import { type NextRequest, NextResponse } from "next/server";
import { getBackendBaseUrl, getBearerTokenFromRequest } from "../../backend";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ attachmentId: string }> }
) {
  const baseUrl = getBackendBaseUrl();
  const token = getBearerTokenFromRequest(req);
  const { attachmentId } = await context.params;

  try {
    const response = await fetch(`${baseUrl}/v1/attachments/${encodeURIComponent(attachmentId)}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      } satisfies Record<string, string>,
      cache: "no-store"
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    return NextResponse.json(
      {
        code: 502,
        message: error instanceof Error ? error.message : "attachment detail request failed",
        data: null
      },
      { status: 502 }
    );
  }
}
