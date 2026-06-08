import { type NextRequest, NextResponse } from "next/server";
import { getBackendBaseUrl, getBearerTokenFromRequest } from "../../backend";

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

// GET /api/model-configs/:id - 获取单个配置
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyFetch(req, `/v1/model-configs/${id}`);
}

// PUT /api/model-configs/:id - 更新配置
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  return proxyFetch(req, `/v1/model-configs/${id}`, {
    method: "PUT",
    body: JSON.stringify(body)
  });
}

// DELETE /api/model-configs/:id - 删除配置
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyFetch(req, `/v1/model-configs/${id}`, {
    method: "DELETE"
  });
}
