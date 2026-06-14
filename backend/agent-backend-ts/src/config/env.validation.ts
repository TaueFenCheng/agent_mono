export function validateEnv(rawEnv: Record<string, unknown>): Record<string, unknown> {
  const env = { ...rawEnv };

  const postgresUrl = String(env.POSTGRES_URL ?? env.DATABASE_URL ?? "").trim();
  const postgresHost = String(env.POSTGRES_HOST ?? "").trim();
  const postgresPort = String(env.POSTGRES_PORT ?? "").trim();
  const postgresUser = String(env.POSTGRES_USER ?? "").trim();
  const postgresDb = String(env.POSTGRES_DB ?? "").trim();

  if (!postgresUrl && !(postgresHost && postgresPort && postgresUser && postgresDb)) {
    throw new Error(
      "Invalid database config: set POSTGRES_URL (or DATABASE_URL), or set POSTGRES_HOST/POSTGRES_PORT/POSTGRES_USER/POSTGRES_DB"
    );
  }

  const redisUrl = String(env.REDIS_URL ?? "").trim();
  if (!redisUrl) {
    env.REDIS_URL = "redis://127.0.0.1:6379";
  }

  const redisPort = Number(String(env.REDIS_PORT ?? "").trim() || "0");
  if (String(env.REDIS_PORT ?? "").trim() && (!Number.isInteger(redisPort) || redisPort <= 0)) {
    throw new Error("Invalid REDIS_PORT: must be a positive integer");
  }

  const nestPortRaw = String(env.NEST_PORT ?? "").trim();
  if (nestPortRaw) {
    const nestPort = Number(nestPortRaw);
    if (!Number.isInteger(nestPort) || nestPort <= 0) {
      throw new Error("Invalid NEST_PORT: must be a positive integer");
    }
  }

  const jwtSecret = String(env.JWT_SECRET ?? "").trim();
  if (!jwtSecret) {
    env.JWT_SECRET = "dev-jwt-secret-change-me";
  }

  const jwtExpiresIn = String(env.JWT_EXPIRES_IN ?? "").trim();
  if (!jwtExpiresIn) {
    env.JWT_EXPIRES_IN = "7d";
  }

  const objectStorageTtlRaw = String(env.OBJECT_STORAGE_SIGN_TTL_SEC ?? "").trim();
  if (objectStorageTtlRaw) {
    const ttl = Number(objectStorageTtlRaw);
    if (!Number.isInteger(ttl) || ttl <= 0) {
      throw new Error("Invalid OBJECT_STORAGE_SIGN_TTL_SEC: must be a positive integer");
    }
  }

  const maxUploadMbRaw = String(env.ATTACHMENT_MAX_UPLOAD_MB ?? "").trim();
  if (maxUploadMbRaw) {
    const maxUploadMb = Number(maxUploadMbRaw);
    if (!Number.isInteger(maxUploadMb) || maxUploadMb <= 0) {
      throw new Error("Invalid ATTACHMENT_MAX_UPLOAD_MB: must be a positive integer");
    }
  }

  const chunkCharsRaw = String(env.ATTACHMENT_CHUNK_MAX_CHARS ?? "").trim();
  if (chunkCharsRaw) {
    const chunkChars = Number(chunkCharsRaw);
    if (!Number.isInteger(chunkChars) || chunkChars < 200) {
      throw new Error("Invalid ATTACHMENT_CHUNK_MAX_CHARS: must be an integer >= 200");
    }
  }

  const ragServiceUrl = String(env.RAG_SERVICE_URL ?? "").trim();
  if (ragServiceUrl) {
    try {
      new URL(ragServiceUrl);
    } catch {
      throw new Error("Invalid RAG_SERVICE_URL: must be a valid URL");
    }
  }

  const ragTimeoutRaw = String(env.RAG_REQUEST_TIMEOUT_MS ?? "").trim();
  if (ragTimeoutRaw) {
    const timeout = Number(ragTimeoutRaw);
    if (!Number.isInteger(timeout) || timeout <= 0) {
      throw new Error("Invalid RAG_REQUEST_TIMEOUT_MS: must be a positive integer");
    }
  }

  return env;
}
