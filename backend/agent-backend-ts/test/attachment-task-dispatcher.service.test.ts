import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { AttachmentTaskDispatcherService } from "../src/attachment/attachment-task-dispatcher.service.js";

describe("AttachmentTaskDispatcherService", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("posts processed attachment ids to the rag service", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: vi.fn().mockResolvedValue("")
    });
    global.fetch = fetchMock as any;

    const configService = {
      get: vi.fn((key: string) => {
        if (key === "rag.serviceUrl") return "http://127.0.0.1:8082";
        if (key === "rag.autoIndexAttachments") return true;
        if (key === "rag.requestTimeoutMs") return 2000;
        return undefined;
      })
    } as any;

    const service = new AttachmentTaskDispatcherService(configService);
    await service.onAttachmentProcessed("att-1");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://127.0.0.1:8082/v1/rag/index/attachments");
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ attachmentIds: ["att-1"] }));
  });

  it("does nothing when auto indexing is disabled", async () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock as any;

    const configService = {
      get: vi.fn((key: string) => {
        if (key === "rag.serviceUrl") return "http://127.0.0.1:8082";
        if (key === "rag.autoIndexAttachments") return false;
        if (key === "rag.requestTimeoutMs") return 2000;
        return undefined;
      })
    } as any;

    const service = new AttachmentTaskDispatcherService(configService);
    await service.onAttachmentProcessed("att-1");

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
