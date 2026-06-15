const UTF8_MOJIBAKE_MARKERS = /[\u0080-\u009f]|[ÃÂÐÑæåçéäöü]/;

export function normalizeUploadFileName(fileName: string): string {
  if (!UTF8_MOJIBAKE_MARKERS.test(fileName)) {
    return fileName;
  }

  const bytes = Buffer.from(fileName, "latin1");
  const decoded = bytes.toString("utf8");

  if (decoded.includes("\uFFFD")) {
    return fileName;
  }

  return decoded;
}
