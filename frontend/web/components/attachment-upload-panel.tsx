"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Upload, RefreshCw, FileText, AlertCircle, CheckCircle2, LoaderCircle } from "lucide-react";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@intelligent-agent/ui";

interface BackendEnvelope<T> {
  code: number | string;
  message: string;
  data: T;
}

interface AttachmentItem {
  id: string;
  threadId: string | null;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  status: string;
  parser: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  previewUrl?: string;
  textPreview?: string | null;
}

interface AttachmentListResponse {
  attachments: AttachmentItem[];
}

interface UploadAttachmentResponse extends AttachmentItem {
  jobId: string;
  jobStatus: string;
}

interface JobStatusResponse {
  jobId: string;
  status: string;
  progress?: number;
  result?: Record<string, unknown> | null;
  failedReason?: string | null;
  createdAt?: string | null;
  finishedAt?: string | null;
}

interface AttachmentRecord extends AttachmentItem {
  jobId?: string;
  jobStatus?: string;
  failedReason?: string | null;
}

interface AttachmentUploadPanelProps {
  accessToken: string;
  threadId: string;
  onUnauthorized?: () => void;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTime(iso: string) {
  const value = new Date(iso);
  if (Number.isNaN(value.getTime())) return iso;
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(value);
}

function statusTone(status: string) {
  switch (status) {
    case "processed":
    case "completed":
      return "text-emerald-600 dark:text-emerald-300";
    case "failed":
      return "text-red-600 dark:text-red-300";
    case "processing":
    case "active":
    case "queued":
    case "waiting":
    case "uploaded":
      return "text-amber-600 dark:text-amber-300";
    default:
      return "text-foreground/65";
  }
}

function shouldPoll(item: AttachmentRecord) {
  return Boolean(item.jobId) && !["processed", "failed", "completed"].includes(item.status) && item.jobStatus !== "failed";
}

async function parseEnvelope<T>(response: Response): Promise<BackendEnvelope<T>> {
  const result = (await response.json()) as BackendEnvelope<T>;
  if (!response.ok) {
    throw new Error(result.message || `request failed: ${response.status}`);
  }
  return result;
}

export function AttachmentUploadPanel({ accessToken, threadId, onUnauthorized }: AttachmentUploadPanelProps) {
  const [items, setItems] = useState<AttachmentRecord[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const authHeaders = useMemo(
    () => ({
      authorization: `Bearer ${accessToken}`
    }),
    [accessToken]
  );

  const handleUnauthorized = useCallback(
    (message: string) => {
      if (message.includes("401")) {
        onUnauthorized?.();
      }
    },
    [onUnauthorized]
  );

  const loadAttachments = useCallback(async () => {
    setIsRefreshing(true);
    setError("");

    try {
      const response = await fetch(`/api/attachments?threadId=${encodeURIComponent(threadId)}&limit=20`, {
        headers: authHeaders,
        cache: "no-store"
      });
      const result = await parseEnvelope<AttachmentListResponse>(response);
      setItems((current) => {
        const byId = new Map(current.map((item) => [item.id, item]));
        return result.data.attachments.map((item) => {
          const currentItem = byId.get(item.id);
          return {
            ...currentItem,
            ...item
          };
        });
      });
    } catch (fetchError) {
      const message = fetchError instanceof Error ? fetchError.message : "附件列表加载失败";
      handleUnauthorized(message);
      setError(message);
    } finally {
      setIsRefreshing(false);
    }
  }, [authHeaders, handleUnauthorized, threadId]);

  useEffect(() => {
    void loadAttachments();
  }, [loadAttachments]);

  useEffect(() => {
    const pollingItems = items.filter(shouldPoll);
    if (pollingItems.length === 0) return;

    const timer = window.setInterval(() => {
      void Promise.all(
        pollingItems.map(async (item) => {
          const jobResponse = await fetch(`/api/attachments/jobs/${encodeURIComponent(item.jobId!)}`, {
            headers: authHeaders,
            cache: "no-store"
          });
          const jobResult = await parseEnvelope<JobStatusResponse>(jobResponse);

          let nextItem: AttachmentRecord = {
            ...item,
            jobStatus: jobResult.data.status,
            failedReason: jobResult.data.failedReason ?? null
          };

          if (jobResult.data.status === "completed" || jobResult.data.status === "failed") {
            const detailResponse = await fetch(`/api/attachments/${encodeURIComponent(item.id)}`, {
              headers: authHeaders,
              cache: "no-store"
            });
            const detailResult = await parseEnvelope<AttachmentItem>(detailResponse);
            nextItem = {
              ...nextItem,
              ...detailResult.data,
              jobStatus: jobResult.data.status,
              failedReason: jobResult.data.failedReason ?? null
            };
          }

          setItems((current) => current.map((entry) => (entry.id === item.id ? nextItem : entry)));
        }).map((task) =>
          task.catch((pollError) => {
            const message = pollError instanceof Error ? pollError.message : "附件状态轮询失败";
            handleUnauthorized(message);
          })
        )
      );
    }, 3000);

    return () => {
      window.clearInterval(timer);
    };
  }, [authHeaders, handleUnauthorized, items]);

  const handleUpload = useCallback(async () => {
    if (!selectedFile || isUploading) return;

    setIsUploading(true);
    setError("");

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("threadId", threadId);
      formData.append("metadata", JSON.stringify({ source: "frontend-web", uploadedAt: new Date().toISOString() }));

      const response = await fetch("/api/attachments", {
        method: "POST",
        headers: authHeaders,
        body: formData
      });

      const result = await parseEnvelope<UploadAttachmentResponse>(response);
      setItems((current) => [
        {
          ...result.data,
          jobId: result.data.jobId,
          jobStatus: result.data.jobStatus
        },
        ...current.filter((item) => item.id !== result.data.id)
      ]);
      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (uploadError) {
      const message = uploadError instanceof Error ? uploadError.message : "附件上传失败";
      handleUnauthorized(message);
      setError(message);
    } finally {
      setIsUploading(false);
    }
  }, [authHeaders, handleUnauthorized, isUploading, selectedFile, threadId]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>附件上传</CardTitle>
        <CardDescription>上传到当前会话后，后端会自动解析文本并触发 RAG 索引。</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <input
            ref={fileInputRef}
            type="file"
            className="block w-full text-sm text-foreground/80 file:mr-3 file:rounded-md file:border-0 file:bg-foreground/10 file:px-3 file:py-2 file:text-sm file:text-foreground"
            onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
          />
          <div className="flex items-center gap-2">
            <Button onClick={handleUpload} disabled={!selectedFile || isUploading} className="gap-2">
              {isUploading ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Upload className="h-4 w-4" aria-hidden="true" />}
              上传
            </Button>
            <Button variant="outline" onClick={() => void loadAttachments()} disabled={isRefreshing} className="gap-2">
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} aria-hidden="true" />
              刷新
            </Button>
          </div>
        </div>

        <div className="rounded-md border border-border/60 bg-background/40 px-3 py-2 text-xs text-foreground/60">
          当前 threadId: <span className="font-mono">{threadId}</span>
        </div>

        {error ? (
          <div className="flex items-start gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-300">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        ) : null}

        <div className="space-y-3">
          {items.length === 0 ? (
            <div className="rounded-md border border-dashed border-border/60 px-3 py-5 text-sm text-foreground/60">
              当前会话还没有附件。
            </div>
          ) : null}

          {items.map((item) => (
            <div key={item.id} className="rounded-lg border border-border/60 px-4 py-3">
              <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 shrink-0 text-foreground/55" aria-hidden="true" />
                    <div className="truncate text-sm font-medium">{item.fileName}</div>
                  </div>
                  <div className="text-xs text-foreground/55">
                    {item.contentType} · {formatBytes(item.sizeBytes)} · 上传于 {formatTime(item.createdAt)}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className={`rounded-full border border-border/60 px-2 py-1 ${statusTone(item.status)}`}>
                    解析状态: {item.status}
                  </span>
                  {item.jobStatus ? (
                    <span className={`rounded-full border border-border/60 px-2 py-1 ${statusTone(item.jobStatus)}`}>
                      任务状态: {item.jobStatus}
                    </span>
                  ) : null}
                </div>
              </div>

              {item.error || item.failedReason ? (
                <div className="mt-3 flex items-start gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-300">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{item.error || item.failedReason}</span>
                </div>
              ) : null}

              {!item.error && !item.failedReason && item.status === "processed" ? (
                <div className="mt-3 flex items-start gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-600 dark:text-emerald-300">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>附件已解析完成，后置 RAG 索引任务已触发。</span>
                </div>
              ) : null}

              {item.textPreview ? (
                <div className="mt-3 rounded-md border border-border/50 bg-foreground/5 px-3 py-2 text-xs leading-6 text-foreground/75">
                  {item.textPreview}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
