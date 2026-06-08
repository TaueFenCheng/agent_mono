import { type NextRequest, NextResponse } from "next/server";
import { getBackendBaseUrl, getBearerTokenFromRequest } from "../../../backend";

// POST /api/model-configs/:id/activate - 激活配置
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const baseUrl = getBackendBaseUrl();
  const token = getBearerTokenFromRequest(req);

  const response = await fetch(`${baseUrl}/v1/model-configs/${id}/activate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    }
  });

  const data = await response.json();
  return NextResponse.json(data, { status: response.status });
}
