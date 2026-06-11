import { describe, expect, it } from "vitest";
import { rebuildMultipartFormData } from "./attachment-bff";

describe("rebuildMultipartFormData", () => {
  it("preserves file bytes and field names when rebuilding", async () => {
    const source = new FormData();
    const file = new File(["hello pdf"], "demo.pdf", { type: "application/pdf" });
    source.append("file", file);
    source.append("threadId", "thread-1");

    const rebuilt = await rebuildMultipartFormData(source);
    const rebuiltFile = rebuilt.get("file");
    const rebuiltThreadId = rebuilt.get("threadId");

    expect(rebuiltThreadId).toBe("thread-1");
    expect(rebuiltFile).not.toBeNull();
    expect(typeof rebuiltFile).not.toBe("string");
    expect((rebuiltFile as Blob).size).toBeGreaterThan(0);
  });
});
