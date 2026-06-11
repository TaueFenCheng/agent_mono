import { type NextRequest } from "next/server";
import { getBackendBaseUrl } from "../backend";
import { getAccessTokenOrUnauthorized, proxyBackendJson } from "@/lib/attachment-bff";

export async function GET(req: NextRequest) {
  const threadId = req.nextUrl.searchParams.get("threadId");
  const limit = req.nextUrl.searchParams.get("limit");
  const params = new URLSearchParams();
  if (threadId) params.set("threadId", threadId);
  if (limit) params.set("limit", limit);
  const query = params.toString();
  return proxyBackendJson(req, `/v1/attachments${query ? `?${query}` : ""}`);
}

export async function POST(req: Request) {
  const { accessToken, error } = getAccessTokenOrUnauthorized(req);
  if (error || !accessToken) return error ?? unauthorizedFallback();

  const formData = await req.formData();
  const baseUrl = getBackendBaseUrl();

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/v1/attachments`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`
      },
      body: formData
    });
  } catch (err) {
    return Response.json(
      {
        code: 502,
        message: err instanceof Error ? err.message : "backend upload failed",
        data: null
      },
      { status: 502 }
    );
  }

  const result = await response.json().catch(() => null);
  return Response.json(result, { status: response.status || 502 });
}

function unauthorizedFallback() {
  return Response.json(
    {
      code: 401,
      message: "Missing bearer token",
      data: null
    },
    { status: 401 }
  );
}
