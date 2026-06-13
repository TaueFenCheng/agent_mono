export function getBackendBaseUrl() {
  // 服务端优先用 AGENT_API_INTERNAL_URL（容器间通信），其次用 NEXT_PUBLIC_*
  if (typeof window === "undefined") {
    return process.env.AGENT_API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_AGENT_API_BASE_URL ?? "http://127.0.0.1:8080";
  }
  return process.env.NEXT_PUBLIC_AGENT_API_BASE_URL ?? "http://127.0.0.1:8080";
}

export function getBearerTokenFromRequest(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const token = authHeader.slice("Bearer ".length).trim();
  return token || null;
}

export async function login(
  username: string,
  password: string,
  options: { baseUrl?: string; encryptedPassword?: string } = {}
) {
  const baseUrl = options.baseUrl ?? getBackendBaseUrl();
  const headers: Record<string, string> = { "content-type": "application/json" };

  const body: Record<string, string> = { username };
  if (options.encryptedPassword) {
    body.encryptedPassword = options.encryptedPassword;
  } else {
    body.password = password;
  }

  const response = await fetch(`${baseUrl}/v1/auth/login`, {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  });

  const result = (await response.json().catch(() => null)) as {
    code?: number | string;
    message?: string;
    data?: { accessToken?: unknown; tokenType?: unknown; expiresIn?: unknown; user?: unknown };
  } | null;

  if (!response.ok || typeof result?.data?.accessToken !== "string") {
    throw new Error(result?.message || "登录失败");
  }

  return {
    accessToken: result.data.accessToken as string,
    tokenType: typeof result.data.tokenType === "string" ? result.data.tokenType : "Bearer",
    expiresIn: typeof result.data.expiresIn === "string" ? result.data.expiresIn : undefined,
    user: result.data.user as { sub: string; name: string } | undefined
  };
}
