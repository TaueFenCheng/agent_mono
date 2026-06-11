"use client";

import * as React from "react";
import { cn } from "../../lib/utils";
import {
  attachmentProcessingStatusLabel,
  type AttachmentProcessingStatus
} from "../../types/attachment-record";

export interface AttachmentData {
  url: string;
  filename?: string;
  mediaType?: string;
  title?: string;
  size?: number;
  id?: string;
  status?: AttachmentProcessingStatus;
  error?: string;
}

type AttachmentVariant = "grid" | "inline";

interface AttachmentContextValue {
  data: AttachmentData;
  onRemove?: () => void;
  onOpenPreview?: () => void;
  variant: AttachmentVariant;
}

const AttachmentContext = React.createContext<AttachmentContextValue | null>(null);

function useAttachmentContext() {
  const context = React.useContext(AttachmentContext);
  if (!context) throw new Error("Attachment subcomponent must be used inside <Attachment>.");
  return context;
}

export function getAttachmentLabel(data: AttachmentData): string {
  return data.filename || data.title || "attachment";
}

function formatBytes(value?: number): string {
  if (!value || value <= 0) return "";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function Icon({ label }: { label: string }) {
  return <span className="text-xs">{label}</span>;
}

export function Attachments({
  children,
  className,
  variant = "grid"
}: React.PropsWithChildren<{ className?: string; variant?: AttachmentVariant }>) {
  return (
    <div className={cn(variant === "inline" ? "flex flex-wrap gap-2" : "grid grid-cols-1 gap-2 sm:grid-cols-2", className)}>
      {children}
    </div>
  );
}

export function Attachment({
  data,
  onRemove,
  onOpenPreview,
  className,
  variant = "grid",
  children
}: React.PropsWithChildren<{
  data: AttachmentData;
  onRemove?: () => void;
  onOpenPreview?: () => void;
  className?: string;
  variant?: AttachmentVariant;
}>) {
  return (
    <AttachmentContext.Provider value={{ data, onRemove, onOpenPreview, variant }}>
      <div
        className={cn(
          variant === "inline"
            ? "inline-flex items-center gap-2 rounded-md border border-border/60 bg-card px-2 py-1"
            : "rounded-lg border border-border/60 bg-card p-2",
          className
        )}
      >
        {children}
      </div>
    </AttachmentContext.Provider>
  );
}

export function AttachmentPreview({ className }: { className?: string }) {
  const { data, onOpenPreview, variant } = useAttachmentContext();
  const mediaType = data.mediaType ?? "";

  if (mediaType.startsWith("image/")) {
    return (
      <img
        src={data.url}
        alt={getAttachmentLabel(data)}
        className={cn(
          variant === "inline" ? "h-6 w-6 rounded object-cover" : "h-24 w-full rounded-md object-cover",
          onOpenPreview ? "cursor-zoom-in" : "",
          className
        )}
        onClick={(event) => {
          if (!onOpenPreview) return;
          event.stopPropagation();
          onOpenPreview();
        }}
      />
    );
  }

  const icon = mediaType.startsWith("video/")
    ? <Icon label="🎬" />
    : mediaType.startsWith("audio/")
      ? <Icon label="🎵" />
      : mediaType
        ? <Icon label="📄" />
        : <Icon label="📎" />;

  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-md bg-foreground/10 text-foreground/75",
        variant === "inline" ? "h-6 w-6" : "h-24 w-full",
        onOpenPreview ? "cursor-pointer" : "",
        className
      )}
      aria-label={getAttachmentLabel(data)}
      onClick={(event) => {
        if (!onOpenPreview) return;
        event.stopPropagation();
        onOpenPreview();
      }}
    >
      {mediaType.startsWith("image/") ? <Icon label="🖼" /> : icon}
    </div>
  );
}

function statusClassName(status: AttachmentProcessingStatus): string {
  switch (status) {
    case "uploading":
    case "processing":
      return "text-amber-600 dark:text-amber-300";
    case "ready":
      return "text-emerald-600 dark:text-emerald-300";
    case "failed":
      return "text-red-600 dark:text-red-300";
    default:
      return "text-foreground/60";
  }
}

export function AttachmentStatus({ className }: { className?: string }) {
  const { data } = useAttachmentContext();
  if (!data.status) return null;

  const label = attachmentProcessingStatusLabel(data.status);
  return (
    <span className={cn("shrink-0 text-[10px] font-medium", statusClassName(data.status), className)}>
      {label}
    </span>
  );
}

export function AttachmentInfo({ className }: { className?: string }) {
  const { data, onOpenPreview, variant } = useAttachmentContext();
  const label = getAttachmentLabel(data);
  const size = formatBytes(data.size);

  return (
    <div
      className={cn("min-w-0", onOpenPreview ? "cursor-pointer" : "", className)}
      onClick={(event) => {
        if (!onOpenPreview) return;
        event.stopPropagation();
        onOpenPreview();
      }}
    >
      <p className={cn("truncate text-xs font-medium", variant === "inline" ? "max-w-24" : "max-w-full")}>{label}</p>
      {variant === "inline" ? null : (
        <p className="truncate text-[11px] text-foreground/55">
          {[data.mediaType, size].filter(Boolean).join(" · ")}
        </p>
      )}
      {data.error ? <p className="truncate text-[10px] text-red-600 dark:text-red-300">{data.error}</p> : null}
    </div>
  );
}

export function AttachmentRemove({ className }: { className?: string }) {
  const { onRemove } = useAttachmentContext();
  if (!onRemove) return null;
  return (
    <button
      type="button"
      aria-label="Remove attachment"
      onClick={(event) => {
        event.stopPropagation();
        onRemove();
      }}
      className={cn(
        "inline-flex h-6 w-6 items-center justify-center rounded text-foreground/65 hover:bg-foreground/10 hover:text-foreground",
        className
      )}
    >
      <span aria-hidden="true">✕</span>
    </button>
  );
}
