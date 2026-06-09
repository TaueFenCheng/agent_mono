import { registerAs } from "@nestjs/config";

function toBoolean(input: string | undefined, fallback: boolean): boolean {
  if (input == null) return fallback;
  const value = input.trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(value)) return true;
  if (["0", "false", "no", "n", "off"].includes(value)) return false;
  return fallback;
}

export default registerAs("objectStorage", () => ({
  endpoint: process.env.OBJECT_STORAGE_ENDPOINT ?? "http://127.0.0.1:9000",
  region: process.env.OBJECT_STORAGE_REGION ?? "us-east-1",
  bucket: process.env.OBJECT_STORAGE_BUCKET ?? "intelligent-agent",
  accessKeyId: process.env.OBJECT_STORAGE_ACCESS_KEY ?? "minioadmin",
  secretAccessKey: process.env.OBJECT_STORAGE_SECRET_KEY ?? "minioadmin",
  forcePathStyle: toBoolean(process.env.OBJECT_STORAGE_FORCE_PATH_STYLE, true),
  signTtlSeconds: Number(process.env.OBJECT_STORAGE_SIGN_TTL_SEC ?? 3600)
}));
