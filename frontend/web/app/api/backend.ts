export function getBackendBaseUrl() {
  return process.env.NEXT_PUBLIC_AGENT_API_BASE_URL ?? "http://127.0.0.1:8080";
}

export async function getBackendAccessToken(baseUrl = getBackendBaseUrl()) {
  const response = await fetch(`${baseUrl}/v1/auth/token`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      sub: "web-console",
      name: "Web Console",
      roles: ["user"]
    })
  });

  const result = (await response.json()) as { data?: { accessToken?: unknown } };
  if (!response.ok || typeof result.data?.accessToken !== "string") {
    throw new Error("failed to create backend access token");
  }

  return result.data.accessToken;
}
