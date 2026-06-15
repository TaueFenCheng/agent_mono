import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { chunkText, parseAttachment } from "../src/attachment/attachment.parser.js";

describe("attachment parser", () => {
  it("extracts rows from an xlsx workbook", async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("任务明细");
    worksheet.addRow(["任务名称", "完成时间"]);
    worksheet.addRow(["出茶机管道检查", "周五"]);
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

    const parsed = await parseAttachment({
      buffer,
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      fileName: "总部任务模版导入v6.xlsx"
    });

    expect(parsed.parser).toBe("exceljs");
    expect(parsed.text).toContain("# 工作表: 任务明细");
    expect(parsed.text).toContain("A=出茶机管道检查");
    expect(parsed.text).toContain("B=周五");
    expect(chunkText(parsed.text)).toHaveLength(1);
  });
});
