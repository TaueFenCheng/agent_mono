import { describe, expect, it, vi } from "vitest";
import {
  AttachmentRequestError,
  attachmentRecordToData,
  isTerminalJobStatus,
  pollAttachmentJob,
  uploadAttachmentFile
} from "./attachment-upload";

describe("attachment-upload helpers", () => {
  it("detects terminal BullMQ job states", () => {
    expect(isTerminalJobStatus("completed")).toBe(true);
    expect(isTerminalJobStatus("failed")).toBe(true);
    expect(isTerminalJobStatus("active")).toBe(false);
    expect(isTerminalJobStatus("waiting")).toBe(false);
  });

  it("maps processed attachment records to ready attachment data", () => {
    const data = attachmentRecordToData(
      {
        id: "att-1",
        threadId: "thread-1",
        runId: null,
        fileName: "demo.pdf",
        contentType: "application/pdf",
        sizeBytes: 1024,
        status: "processed",
        parser: "pdf",
        error: null,
        metadata: {},
        createdAt: "2026-06-11T00:00:00.000Z",
        updatedAt: "2026-06-11T00:00:01.000Z",
        previewUrl: "https://example.com/demo.pdf"
      },
      { filename: "fallback.pdf" }
    );

    expect(data).toMatchObject({
      id: "att-1",
      url: "https://example.com/demo.pdf",
      filename: "demo.pdf",
      mediaType: "application/pdf",
      size: 1024,
      status: "ready"
    });
  });

  it("uploads multipart form data to the BFF route", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 0,
          message: "ok",
          data: {
            id: "att-2",
            threadId: "thread-2",
            runId: null,
            fileName: "notes.txt",
            contentType: "text/plain",
            sizeBytes: 12,
            status: "uploaded",
            parser: null,
            error: null,
            metadata: {},
            createdAt: "2026-06-11T00:00:00.000Z",
            updatedAt: "2026-06-11T00:00:00.000Z",
            jobId: "job-1",
            jobStatus: "queued"
          }
        }),
        { status: 200 }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const file = new File(["hello"], "notes.txt", { type: "text/plain" });
    const record = await uploadAttachmentFile(file, "thread-2", { authorization: "Bearer test-token" });

    expect(record.id).toBe("att-2");
    expect(record.jobId).toBe("job-1");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/attachments");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({ authorization: "Bearer test-token" });
    expect(init.body).toBeInstanceOf(FormData);

    vi.unstubAllGlobals();
  });

  it("throws AttachmentRequestError on unauthorized responses", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 401,
          message: "Missing bearer token",
          data: null
        }),
        { status: 401 }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const file = new File(["hello"], "notes.txt", { type: "text/plain" });
    await expect(uploadAttachmentFile(file, "thread-2", {})).rejects.toMatchObject({
      name: "AttachmentRequestError",
      status: 401,
      message: "Missing bearer token"
    });

    vi.unstubAllGlobals();
  });

  it("polls job status until completed", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: 0,
            message: "ok",
            data: { jobId: "job-9", status: "active" }
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: 0,
            message: "ok",
            data: { jobId: "job-9", status: "completed", result: { status: "processed" } }
          }),
          { status: 200 }
        )
      );
    vi.stubGlobal("fetch", fetchMock);

    const statuses: string[] = [];
    const job = await pollAttachmentJob(
      "job-9",
      { authorization: "Bearer test-token" },
      {
        intervalMs: 0,
        timeoutMs: 1000,
        sleepFn: async () => undefined,
        onStatus: (status) => statuses.push(status)
      }
    );

    expect(job.status).toBe("completed");
    expect(statuses).toEqual(["active", "completed"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    vi.unstubAllGlobals();
  });
});
