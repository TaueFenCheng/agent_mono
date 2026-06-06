import { registerAs } from "@nestjs/config";

export default registerAs("attachment", () => ({
  maxUploadMb: Number(process.env.ATTACHMENT_MAX_UPLOAD_MB ?? 25),
  chunkMaxChars: Number(process.env.ATTACHMENT_CHUNK_MAX_CHARS ?? 1200),
  ocrLang: process.env.ATTACHMENT_OCR_LANG ?? "eng+chi_sim"
}));
