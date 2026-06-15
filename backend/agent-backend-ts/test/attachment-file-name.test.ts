import { describe, expect, it } from "vitest";
import { normalizeUploadFileName } from "../src/attachment/attachment-file-name.js";

describe("normalizeUploadFileName", () => {
  it("restores UTF-8 file names decoded as latin1", () => {
    const expected = "总部任务模版导入v6.xlsx";
    const mojibake = Buffer.from(expected, "utf8").toString("latin1");

    expect(normalizeUploadFileName(mojibake)).toBe(expected);
  });

  it("keeps normal ASCII file names unchanged", () => {
    expect(normalizeUploadFileName("report-v6.xlsx")).toBe("report-v6.xlsx");
  });

  it("keeps invalid UTF-8 latin1 names unchanged", () => {
    expect(normalizeUploadFileName("café.xlsx")).toBe("café.xlsx");
  });
});
