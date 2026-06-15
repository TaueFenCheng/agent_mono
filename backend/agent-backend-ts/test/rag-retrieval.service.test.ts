import { afterEach, describe, expect, it, vi } from "vitest";
import { RagRetrievalService } from "../src/agent/rag-retrieval.service.js";

function createConfig() {
  return {
    get: vi.fn((key: string) => {
      if (key === "rag.serviceUrl") return "http://rag:8082";
      if (key === "rag.retrieveForAgent") return true;
      if (key === "rag.retrieveTopK") return 5;
      if (key === "rag.maxContextChars") return 12000;
      if (key === "rag.requestTimeoutMs") return 2000;
      return undefined;
    })
  } as any;
}

describe("RagRetrievalService", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("retrieves thread-scoped attachment context for the agent", async () => {
    const db = {
      getPrisma: () => ({
        attachment: {
          count: vi.fn().mockResolvedValue(1)
        }
      })
    } as any;
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 0,
          message: "ok",
          data: {
            hits: [
              {
                nodeId: "att-1:0",
                documentId: "att-1",
                attachmentId: "att-1",
                fileName: "总部任务模版导入v6.xlsx",
                chunkIndex: 0,
                score: 0.91,
                text: "总部任务需要在周五前完成。"
              }
            ]
          }
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );

    const service = new RagRetrievalService(createConfig(), db);
    const result = await service.retrieve("任务什么时候完成？", "thread-1");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://rag:8082/v1/rag/search",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          query: "任务什么时候完成？",
          threadId: "thread-1",
          topK: 5
        })
      })
    );
    expect(result.hitCount).toBe(1);
    expect(result.systemContext).toContain("总部任务模版导入v6.xlsx");
    expect(result.systemContext).toContain("总部任务需要在周五前完成。");
    expect(result.cacheSignature).not.toBe("none");
  });

  it("skips the rag request when the thread has no processed attachments", async () => {
    const db = {
      getPrisma: () => ({
        attachment: {
          count: vi.fn().mockResolvedValue(0)
        }
      })
    } as any;
    const fetchMock = vi.spyOn(globalThis, "fetch");

    const service = new RagRetrievalService(createConfig(), db);
    const result = await service.retrieve("hello", "thread-1");

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toEqual({
      systemContext: "",
      cacheSignature: "none",
      hitCount: 0
    });
  });

  it("falls back to parsed attachment chunks when vector search is unavailable", async () => {
    const db = {
      getPrisma: () => ({
        attachment: {
          count: vi.fn().mockResolvedValue(1),
          findMany: vi.fn().mockResolvedValue([
            {
              id: "att-1",
              fileName: "总部任务模版导入v6.xlsx",
              updatedAt: new Date("2026-06-15T09:00:00.000Z"),
              chunks: [
                {
                  id: "chunk-1",
                  chunkIndex: 0,
                  content: "总部任务需要在周五前完成。"
                }
              ]
            }
          ])
        }
      })
    } as any;
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("embedding unavailable", { status: 502 }));

    const service = new RagRetrievalService(createConfig(), db);
    const result = await service.retrieve("任务什么时候完成？", "thread-1");

    expect(result.hitCount).toBe(1);
    expect(result.systemContext).toContain("Semantic retrieval is unavailable");
    expect(result.systemContext).toContain("总部任务需要在周五前完成。");
  });
});
