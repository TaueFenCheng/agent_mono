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

function sanitizeText(input: unknown): string {
  // Handle ExcelJS RichText arrays or other non-string types
  let str: string;
  if (typeof input === "string") {
    str = input;
  } else if (Array.isArray(input)) {
    // ExcelJS RichText: [{ text: "xxx", ... }, ...]
    str = input
      .map((item: Record<string, unknown>) => (typeof item.text === "string" ? item.text : ""))
      .join("");
  } else {
    str = String(input ?? "");
  }
  return str.replace(/\u0000/g, "").replace(/\r\n/g, "\n").trim();
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

async function parseExcel(buffer: Buffer): Promise<ParsedAttachment> {
  const mod = await import("exceljs");
  const ExcelJS = mod.default ?? mod;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as any);

  const lines: string[] = [];
  const sheetMetadata: Array<{ name: string; rowCount: number; columnCount: number }> = [];

  workbook.eachSheet((worksheet) => {
    sheetMetadata.push({
      name: worksheet.name,
      rowCount: worksheet.rowCount,
      columnCount: worksheet.columnCount
    });
    lines.push(`# 工作表: ${worksheet.name}`);
    worksheet.eachRow((row, rowNumber) => {
      const cells: string[] = [];
      row.eachCell({ includeEmpty: false }, (cell, columnNumber) => {
        const text = sanitizeText(cell.text ?? "");
        if (text) {
          cells.push(`${worksheet.getColumn(columnNumber).letter}=${text}`);
        }
      });
      if (cells.length > 0) {
        lines.push(`第 ${rowNumber} 行: ${cells.join(" | ")}`);
      }
    });
    lines.push("");
  });

  return {
    parser: "exceljs",
    text: sanitizeText(lines.join("\n")),
    metadata: {
      sheets: sheetMetadata
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
  console.log(`[OCR] Starting OCR parse, buffer size: ${buffer.length} bytes, lang: ${ocrLang}`);

  try {
    const mod = await import("tesseract.js");
    console.log("[OCR] tesseract.js module loaded, exports:", Object.keys(mod));

    // tesseract.js v7 is CJS, need to access .default for ESM import
    const tesseract = mod.default ?? mod;
    const recognize = tesseract.recognize as (image: Buffer, lang?: string) => Promise<{ data?: { text?: string } }>;

    if (typeof recognize !== "function") {
      throw new Error(`recognize is not a function, available: ${Object.keys(tesseract).join(", ")}`);
    }

    console.log("[OCR] Calling recognize...");
    const result = await recognize(buffer, ocrLang);
    console.log("[OCR] Raw result keys:", result ? Object.keys(result) : "null");
    console.log("[OCR] result.data keys:", result?.data ? Object.keys(result.data) : "null");

    const text = sanitizeText(result?.data?.text ?? "");

    console.log(`[OCR] Success, extracted ${text.length} chars`);
    return {
      parser: "tesseract.js",
      text,
      metadata: {
        ocr: true,
        lang: ocrLang
      }
    };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    const errStack = error instanceof Error ? error.stack : undefined;
    console.error("[OCR] Failed:", errMsg);
    if (errStack) console.error("[OCR] Stack:", errStack);

    return {
      parser: "ocr-unavailable",
      text: "",
      metadata: {
        ocr: false,
        error: errMsg,
        stack: errStack
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

  if (
    contentType.includes("spreadsheetml.sheet") ||
    ext === ".xlsx"
  ) {
    return parseExcel(input.buffer);
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
