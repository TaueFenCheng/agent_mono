import { registerAs } from "@nestjs/config";

export default registerAs("rag", () => ({
  serviceUrl: process.env.RAG_SERVICE_URL ?? "http://127.0.0.1:8082",
  autoIndexAttachments: String(process.env.RAG_AUTO_INDEX_ATTACHMENTS ?? "true").toLowerCase() !== "false",
  retrieveForAgent: String(process.env.RAG_RETRIEVE_FOR_AGENT ?? "true").toLowerCase() !== "false",
  retrieveTopK: Number(process.env.RAG_RETRIEVE_TOP_K ?? 5),
  maxContextChars: Number(process.env.RAG_MAX_CONTEXT_CHARS ?? 12000),
  requestTimeoutMs: Number(process.env.RAG_REQUEST_TIMEOUT_MS ?? 10000)
}));
