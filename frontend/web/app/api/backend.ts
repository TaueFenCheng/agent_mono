export function getBackendBaseUrl() {
  return process.env.NEXT_PUBLIC_AGENT_API_BASE_URL ?? "http://127.0.0.1:8080";
}

export function getBearerTokenFromRequest(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const token = authHeader.slice("Bearer ".length).trim();
  return token || null;
}

export async function createBackendAccessToken(
  payload: {
    sub: string;
    name?: string;
    roles?: string[];
    metadata?: Record<string, unknown>;
  },
  options: {
    baseUrl?: string;
    bootstrapKey?: string;
  } = {}
) {
  const baseUrl = options.baseUrl ?? getBackendBaseUrl();
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (options.bootstrapKey) {
    headers["x-bootstrap-key"] = options.bootstrapKey;
  }

  const response = await fetch(`${baseUrl}/v1/auth/token`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload)
  });

  const result = (await response.json().catch(() => null)) as {
    code?: number | string;
    message?: string;
    data?: { accessToken?: unknown; tokenType?: unknown; expiresIn?: unknown };
  } | null;

  if (!response.ok || typeof result?.data?.accessToken !== "string") {
    throw new Error(result?.message || "failed to create backend access token");
  }

  return {
    accessToken: result.data.accessToken,
    tokenType: typeof result.data.tokenType === "string" ? result.data.tokenType : "Bearer",
    expiresIn: typeof result.data.expiresIn === "string" ? result.data.expiresIn : undefined
  };
}
