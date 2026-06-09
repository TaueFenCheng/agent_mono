import { registerAs } from "@nestjs/config";

function buildPostgresUrl(): string {
  if (process.env.POSTGRES_URL?.trim()) return process.env.POSTGRES_URL.trim();
  if (process.env.DATABASE_URL?.trim()) return process.env.DATABASE_URL.trim();

  const host = process.env.POSTGRES_HOST ?? "127.0.0.1";
  const port = process.env.POSTGRES_PORT ?? "5432";
  const user = process.env.POSTGRES_USER ?? "intelligent";
  const password = process.env.POSTGRES_PASSWORD ?? "intelligent";
  const db = process.env.POSTGRES_DB ?? "intelligent_agent";
  return `postgresql://${user}:${password}@${host}:${port}/${db}`;
}

export default registerAs("postgres", () => ({
  url: buildPostgresUrl()
}));
