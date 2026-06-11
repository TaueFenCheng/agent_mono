/** Backend attachment record returned by NestJS attachment API. */
export interface AttachmentRecord {
  id: string;
  threadId: string | null;
  runId: string | null;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  status: string;
  parser: string | null;
  error: string | null;
  metadata: unknown;
  createdAt: string;
  updatedAt: string;
  previewUrl?: string;
  textPreview?: string | null;
  jobId?: string;
  jobStatus?: string;
}

export interface AttachmentJobRecord {
  jobId: string;
  status: string;
  progress?: number;
  result?: Record<string, unknown> | null;
  failedReason?: string | null;
  createdAt?: string | null;
  finishedAt?: string | null;
}

export type AttachmentProcessingStatus = "uploading" | "processing" | "ready" | "failed";

export function attachmentProcessingStatusLabel(status: AttachmentProcessingStatus): string {
  switch (status) {
    case "uploading":
      return "上传中";
    case "processing":
      return "解析中";
    case "ready":
      return "就绪";
    case "failed":
      return "失败";
    default:
      return status;
  }
}

export function mapRecordStatusToProcessing(status: string): AttachmentProcessingStatus {
  if (status === "processed") return "ready";
  if (status === "failed") return "failed";
  if (status === "processing" || status === "uploaded") return "processing";
  return "processing";
}
