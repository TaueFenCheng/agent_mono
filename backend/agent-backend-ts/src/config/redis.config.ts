import { registerAs } from "@nestjs/config";

function parseRedisUrl(url: string): { host: string; port: number } {
  try {
    const parsed = new URL(url);
    return {
      host: parsed.hostname || "127.0.0.1",
      port: Number(parsed.port || 6379)
    };
  } catch {
    return { host: "127.0.0.1", port: 6379 };
  }
}

export default registerAs("redis", () => {
  const url = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";
  const endpoint = parseRedisUrl(url);
  return {
    url,
    host: endpoint.host,
    port: endpoint.port
  };
});
