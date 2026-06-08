import { type NextRequest, NextResponse } from "next/server";
import { getBackendBaseUrl, getBearerTokenFromRequest } from "../backend";

async function proxyFetch(req: NextRequest, path: string, options: RequestInit = {}) {
  const baseUrl = getBackendBaseUrl();
  const token = getBearerTokenFromRequest(req);

  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers
    }
  });

  const data = await response.json();
  return NextResponse.json(data, { status: response.status });
}

// GET /api/model-configs - 列出所有模型配置
export async function GET(req: NextRequest) {
  return proxyFetch(req, "/v1/model-configs");
}

// POST /api/model-configs - 创建模型配置
export async function POST(req: NextRequest) {
  const body = await req.json();
  return proxyFetch(req, "/v1/model-configs", {
    method: "POST",
    body: JSON.stringify(body)
  });
}
