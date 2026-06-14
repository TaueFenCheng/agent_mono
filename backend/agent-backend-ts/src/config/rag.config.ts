import { registerAs } from "@nestjs/config";

export default registerAs("rag", () => ({
  serviceUrl: process.env.RAG_SERVICE_URL ?? "http://127.0.0.1:8082",
  autoIndexAttachments: String(process.env.RAG_AUTO_INDEX_ATTACHMENTS ?? "true").toLowerCase() !== "false",
  requestTimeoutMs: Number(process.env.RAG_REQUEST_TIMEOUT_MS ?? 10000)
}));
