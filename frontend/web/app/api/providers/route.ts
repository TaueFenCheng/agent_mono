import { type NextRequest, NextResponse } from "next/server";
import { getBackendBaseUrl, getBearerTokenFromRequest } from "../backend";

// GET /api/providers - 列出支持的 Provider
export async function GET(req: NextRequest) {
  const baseUrl = getBackendBaseUrl();
  const token = getBearerTokenFromRequest(req);

  const response = await fetch(`${baseUrl}/v1/providers`, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    }
  });

  const data = await response.json();
  return NextResponse.json(data, { status: response.status });
}
