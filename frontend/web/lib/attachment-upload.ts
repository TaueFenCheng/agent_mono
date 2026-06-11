import type { AttachmentData } from "@intelligent-agent/ui";
import type { AttachmentJobRecord, AttachmentRecord } from "@intelligent-agent/ui";
import { mapRecordStatusToProcessing } from "@intelligent-agent/ui";

export const ATTACHMENT_POLL_INTERVAL_MS = 1500;
export const ATTACHMENT_POLL_TIMEOUT_MS = 60_000;

interface BackendEnvelope<T> {
  code: number | string;
  message: string;
  data: T;
}

export class AttachmentRequestError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "AttachmentRequestError";
    this.status = status;
  }
}

export function isTerminalJobStatus(status: string): boolean {
  return status === "completed" || status === "failed";
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function attachmentRecordToData(record: AttachmentRecord, fallback?: { filename?: string; mediaType?: string; size?: number }): AttachmentData {
  const processingStatus = mapRecordStatusToProcessing(record.status);
  return {
    id: record.id,
    url: record.previewUrl ?? "",
    filename: record.fileName || fallback?.filename,
    mediaType: record.contentType || fallback?.mediaType,
    size: record.sizeBytes ?? fallback?.size,
    status: processingStatus,
    error: record.error ?? undefined
  };
}

async function parseEnvelope<T>(response: Response): Promise<T> {
  const result = (await response.json().catch(() => null)) as BackendEnvelope<T> | null;
  if (!response.ok) {
    throw new AttachmentRequestError(result?.message || `HTTP ${response.status}`, response.status);
  }
  if (!result || result.code !== 0 || result.data === undefined || result.data === null) {
    throw new AttachmentRequestError(result?.message || "invalid attachment response", response.status);
  }
  return result.data;
}

export async function uploadAttachmentFile(
  file: File,
  threadId: string,
  headers: Record<string, string>,
  apiBasePath = "/api/attachments"
): Promise<AttachmentRecord> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("threadId", threadId);

  const response = await fetch(apiBasePath, {
    method: "POST",
    headers,
    body: formData
  });

  return parseEnvelope<AttachmentRecord>(response);
}

export async function fetchAttachmentJob(
  jobId: string,
  headers: Record<string, string>,
  apiBasePath = "/api/attachments"
): Promise<AttachmentJobRecord> {
  const response = await fetch(`${apiBasePath}/jobs/${encodeURIComponent(jobId)}`, {
    headers,
    cache: "no-store"
  });
  return parseEnvelope<AttachmentJobRecord>(response);
}

export async function fetchAttachmentById(
  attachmentId: string,
  headers: Record<string, string>,
  apiBasePath = "/api/attachments"
): Promise<AttachmentRecord> {
  const response = await fetch(`${apiBasePath}/${encodeURIComponent(attachmentId)}`, {
    headers,
    cache: "no-store"
  });
  return parseEnvelope<AttachmentRecord>(response);
}

export async function pollAttachmentJob(
  jobId: string,
  headers: Record<string, string>,
  options: {
    intervalMs?: number;
    timeoutMs?: number;
    onStatus?: (status: string) => void;
    apiBasePath?: string;
    sleepFn?: (ms: number) => Promise<void>;
    nowFn?: () => number;
  } = {}
): Promise<AttachmentJobRecord> {
  const intervalMs = options.intervalMs ?? ATTACHMENT_POLL_INTERVAL_MS;
  const timeoutMs = options.timeoutMs ?? ATTACHMENT_POLL_TIMEOUT_MS;
  const sleepFn = options.sleepFn ?? sleep;
  const nowFn = options.nowFn ?? Date.now;
  const apiBasePath = options.apiBasePath ?? "/api/attachments";
  const startedAt = nowFn();

  while (nowFn() - startedAt < timeoutMs) {
    const job = await fetchAttachmentJob(jobId, headers, apiBasePath);
    options.onStatus?.(job.status);
    if (isTerminalJobStatus(job.status)) {
      return job;
    }
    await sleepFn(intervalMs);
  }

  throw new Error("附件解析超时，请稍后重试");
}

export async function uploadAndProcessAttachment(
  file: File,
  threadId: string,
  headers: Record<string, string>,
  callbacks: {
    onUploading?: () => void;
    onProcessing?: () => void;
    apiBasePath?: string;
    pollOptions?: Omit<Parameters<typeof pollAttachmentJob>[2], "apiBasePath">;
  } = {}
): Promise<AttachmentData> {
  const apiBasePath = callbacks.apiBasePath ?? "/api/attachments";
  callbacks.onUploading?.();

  const uploaded = await uploadAttachmentFile(file, threadId, headers, apiBasePath);
  if (!uploaded.jobId) {
    throw new Error("上传成功但未返回解析任务");
  }

  callbacks.onProcessing?.();

  const job = await pollAttachmentJob(uploaded.jobId, headers, {
    ...callbacks.pollOptions,
    apiBasePath
  });

  if (job.status === "failed") {
    throw new Error(job.failedReason || "附件解析失败");
  }

  const record = await fetchAttachmentById(uploaded.id, headers, apiBasePath);
  if (record.status === "failed") {
    throw new Error(record.error || "附件解析失败");
  }

  return attachmentRecordToData(record, {
    filename: file.name,
    mediaType: file.type,
    size: file.size
  });
}
