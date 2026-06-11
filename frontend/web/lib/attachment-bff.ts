import { NextResponse } from "next/server";
import { getBackendBaseUrl, getBearerTokenFromRequest } from "@/app/api/backend";

export interface BackendEnvelope<T> {
  code: number | string;
  message: string;
  data: T;
}

export function unauthorizedResponse() {
  return NextResponse.json(
    {
      code: 401,
      message: "Missing bearer token",
      data: null
    },
    { status: 401 }
  );
}

export function getAccessTokenOrUnauthorized(req: Request) {
  const accessToken = getBearerTokenFromRequest(req);
  if (!accessToken) {
    return { accessToken: null, error: unauthorizedResponse() };
  }
  return { accessToken, error: null };
}

async function readBlobBytes(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === "function") {
    return blob.arrayBuffer();
  }
  return new Response(blob).arrayBuffer();
}

/**
 * Next.js App Router 读取后的 FormData 不能直接透传给 node fetch，
 * 需要重建 Blob 才能保留文件内容（否则后端收到空 file）。
 */
export async function rebuildMultipartFormData(formData: FormData): Promise<FormData> {
  const outbound = new FormData();

  for (const [key, value] of formData.entries()) {
    if (typeof value === "string") {
      outbound.append(key, value);
      continue;
    }

    const blob = value as Blob;
    const bytes = await readBlobBytes(blob);
    const filename = value instanceof File && value.name ? value.name : "upload";
    const contentType = blob.type || "application/octet-stream";
    outbound.append(key, new Blob([bytes], { type: contentType }), filename);
  }

  return outbound;
}

export async function proxyBackendJson<T>(req: Request, path: string, init: RequestInit = {}) {
  const { accessToken, error } = getAccessTokenOrUnauthorized(req);
  if (error || !accessToken) return error ?? unauthorizedResponse();

  const baseUrl = getBackendBaseUrl();

  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${accessToken}`,
        ...init.headers
      }
    });
  } catch (err) {
    return NextResponse.json(
      {
        code: 502,
        message: err instanceof Error ? err.message : "backend request failed",
        data: null
      },
      { status: 502 }
    );
  }

  const result = (await response.json().catch(() => null)) as BackendEnvelope<T> | Record<string, unknown> | null;
  return NextResponse.json(result, { status: response.status || 502 });
}
