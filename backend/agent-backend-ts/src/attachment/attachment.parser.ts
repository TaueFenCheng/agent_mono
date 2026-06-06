import path from "node:path";

export interface ParsedAttachment {
  parser: string;
  text: string;
  metadata: Record<string, unknown>;
}

const CODE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".py",
  ".java",
  ".go",
  ".rs",
  ".cpp",
  ".c",
  ".h",
  ".hpp",
  ".md",
  ".json",
  ".yaml",
  ".yml",
  ".toml",
  ".xml",
  ".html",
  ".css",
  ".sql",
  ".sh",
  ".rb",
  ".php"
]);

function sanitizeText(input: string): string {
  return input.replace(/\u0000/g, "").replace(/\r\n/g, "\n").trim();
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function splitByParagraph(text: string): string[] {
  const blocks = text
    .split(/\n{2,}/)
    .map((item) => item.trim())
    .filter(Boolean);
  if (blocks.length > 0) return blocks;
  return text
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function chunkText(text: string, maxChunkChars = 1200): Array<{ content: string; tokenCount: number; chunkIndex: number }> {
  const clean = sanitizeText(text);
  if (!clean) return [];

  const paragraphs = splitByParagraph(clean);
  const chunks: Array<{ content: string; tokenCount: number; chunkIndex: number }> = [];
  let current = "";
  let index = 0;

  const pushCurrent = () => {
    const value = current.trim();
    if (!value) return;
    chunks.push({
      chunkIndex: index++,
      content: value,
      tokenCount: estimateTokens(value)
    });
    current = "";
  };

  for (const block of paragraphs) {
    if (block.length > maxChunkChars) {
      pushCurrent();
      for (let i = 0; i < block.length; i += maxChunkChars) {
        const part = block.slice(i, i + maxChunkChars).trim();
        if (!part) continue;
        chunks.push({
          chunkIndex: index++,
          content: part,
          tokenCount: estimateTokens(part)
        });
      }
      continue;
    }

    const next = current ? `${current}\n\n${block}` : block;
    if (next.length > maxChunkChars) {
      pushCurrent();
      current = block;
      continue;
    }

    current = next;
  }

  pushCurrent();
  return chunks;
}

async function parsePdf(buffer: Buffer): Promise<ParsedAttachment> {
  const mod = await import("pdf-parse");
  const parser = new mod.PDFParse({ data: new Uint8Array(buffer) });
  const result = await parser.getText();
  await parser.destroy();
  return {
    parser: "pdf-parse",
    text: sanitizeText(result.text ?? ""),
    metadata: {
      pages: result.total ?? null
    }
  };
}

async function parseDocx(buffer: Buffer): Promise<ParsedAttachment> {
  const mod = await import("mammoth");
  const mammoth = mod.default ?? mod;
  const result = await mammoth.extractRawText({ buffer });
  return {
    parser: "mammoth",
    text: sanitizeText(result.value ?? ""),
    metadata: {
      messages: result.messages ?? []
    }
  };
}

function parseUtf8(buffer: Buffer, parser: string): ParsedAttachment {
  return {
    parser,
    text: sanitizeText(buffer.toString("utf-8")),
    metadata: {}
  };
}

async function parseImageByOcr(buffer: Buffer, ocrLang = "eng+chi_sim"): Promise<ParsedAttachment> {
  try {
    const mod = await import("tesseract.js");
    const recognize = mod.recognize as (image: Buffer, lang?: string) => Promise<{ data?: { text?: string } }>;
    const result = await recognize(buffer, ocrLang);
    return {
      parser: "tesseract.js",
      text: sanitizeText(result?.data?.text ?? ""),
      metadata: {
        ocr: true,
        lang: ocrLang
      }
    };
  } catch (error) {
    return {
      parser: "ocr-unavailable",
      text: "",
      metadata: {
        ocr: false,
        error: error instanceof Error ? error.message : String(error)
      }
    };
  }
}

export async function parseAttachment(input: {
  buffer: Buffer;
  contentType: string;
  fileName: string;
  ocrLang?: string;
}): Promise<ParsedAttachment> {
  const contentType = input.contentType.toLowerCase();
  const ext = path.extname(input.fileName).toLowerCase();

  if (contentType.includes("pdf") || ext === ".pdf") {
    return parsePdf(input.buffer);
  }

  if (
    contentType.includes("wordprocessingml.document") ||
    contentType.includes("msword") ||
    ext === ".docx" ||
    ext === ".doc"
  ) {
    return parseDocx(input.buffer);
  }

  if (contentType.startsWith("image/")) {
    return parseImageByOcr(input.buffer, input.ocrLang ?? "eng+chi_sim");
  }

  if (contentType.startsWith("text/") || CODE_EXTENSIONS.has(ext)) {
    return parseUtf8(input.buffer, "utf8");
  }

  return {
    parser: "unsupported",
    text: "",
    metadata: {
      supported: false,
      contentType,
      ext
    }
  };
}
