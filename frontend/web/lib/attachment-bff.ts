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
