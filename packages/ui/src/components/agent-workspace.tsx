"use client";

import * as React from "react";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Textarea } from "./ui/textarea";
import { Attachment, AttachmentInfo, Attachments, AttachmentPreview, AttachmentRemove, type AttachmentData } from "./ui/attachments";
import { cn } from "../lib/utils";
import type { AgentRunEvent } from "../types/agent-run-events";

type MessageRole = "user" | "assistant";

export interface AgentWorkspaceMessage {
  id: string;
  role: MessageRole;
  content: string;
  createdAt: string;
  attachments?: AttachmentData[];
}

export interface AgentWorkspaceSession {
  id: string;
  title: string;
  updatedAt: string;
  messages: AgentWorkspaceMessage[];
}

export interface AgentWorkspaceSendInput {
  sessionId: string;
  message: string;
  attachments?: AttachmentData[];
  files?: File[];
  provider?: string;
  model?: string;
}

export interface ModelOption {
  id: string;
  name: string;
  provider: string;
  model: string;
}

export interface AgentWorkspaceSendStreamHandlers {
  onEvent: (event: AgentRunEvent) => void;
}

export type AgentWorkspaceSendStream = (
  input: AgentWorkspaceSendInput,
  handlers: AgentWorkspaceSendStreamHandlers
) => Promise<void>;

interface ToolTimelineEntry {
  id: string;
  toolName: string;
  status: "running" | "done" | "error";
  durationMs?: number;
  error?: string;
}

export interface AgentWorkspaceProps {
  title?: string;
  description?: string;
  placeholder?: string;
  initialPrompt?: string;
  initialSessions?: AgentWorkspaceSession[];
  enableThemeToggle?: boolean;
  modelOptions?: ModelOption[];
  selectedModelId?: string;
  onModelChange?: (modelId: string) => void;
  loadSessions?: () => Promise<AgentWorkspaceSession[]>;
  onSend?: (input: AgentWorkspaceSendInput) => Promise<string>;
  onSendStream?: AgentWorkspaceSendStream;
}

function nowIso() {
  return new Date().toISOString();
}

function newId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createSession(seed?: string): AgentWorkspaceSession {
  return {
    id: newId("thread"),
    title: (seed && seed.trim().slice(0, 24)) || "新会话",
    updatedAt: nowIso(),
    messages: []
  };
}

function AssistantLoadingMessage() {
  return (
    <div className="flex justify-start" aria-live="polite" aria-label="助手正在回复">
      <div className="max-w-[85%] space-y-2 rounded-lg bg-foreground/10 px-3 py-2 text-sm text-foreground">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 animate-pulse rounded-full bg-foreground/45" />
          <span className="text-foreground/70">正在思考</span>
          <span className="flex items-center gap-1" aria-hidden="true">
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-foreground/45 [animation-delay:-0.2s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-foreground/45 [animation-delay:-0.1s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-foreground/45" />
          </span>
        </div>
        <div className="h-1 overflow-hidden rounded-full bg-foreground/10">
          <div className="h-full w-1/2 animate-pulse rounded-full bg-foreground/35" />
        </div>
      </div>
    </div>
  );
}

function StreamingAssistantPanel({
  timeline,
  toolsResolvedCount
}: {
  timeline: ToolTimelineEntry[];
  toolsResolvedCount?: number;
}) {
  return (
    <div className="flex justify-start" aria-live="polite" aria-label="助手正在处理">
      <div className="max-w-[85%] space-y-2 rounded-lg bg-foreground/10 px-3 py-2 text-sm text-foreground">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 animate-pulse rounded-full bg-foreground/45" />
          <span className="text-foreground/70">正在处理</span>
        </div>
        {typeof toolsResolvedCount === "number" ? (
          <p className="text-xs text-foreground/60">已解析 {toolsResolvedCount} 个可用工具</p>
        ) : null}
        {timeline.length > 0 ? (
          <ul className="space-y-1.5 border-l border-foreground/20 pl-3">
            {timeline.map((entry) => (
              <li key={entry.id} className="text-xs">
                {entry.status === "running" ? (
                  <span className="text-foreground/75">正在调用 <code className="rounded bg-foreground/10 px-1">{entry.toolName}</code></span>
                ) : null}
                {entry.status === "done" ? (
                  <span className="text-foreground/75">
                    已完成 <code className="rounded bg-foreground/10 px-1">{entry.toolName}</code>
                    {typeof entry.durationMs === "number" ? ` · ${entry.durationMs}ms` : null}
                  </span>
                ) : null}
                {entry.status === "error" ? (
                  <span className="text-red-600 dark:text-red-300">
                    工具 <code className="rounded bg-red-500/10 px-1">{entry.toolName}</code> 失败
                    {entry.error ? `：${entry.error}` : null}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <div className="h-1 overflow-hidden rounded-full bg-foreground/10">
            <div className="h-full w-1/2 animate-pulse rounded-full bg-foreground/35" />
          </div>
        )}
      </div>
    </div>
  );
}

function findLastRunningToolIndex(entries: ToolTimelineEntry[], toolName: string): number {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (entry && entry.toolName === toolName && entry.status === "running") {
      return index;
    }
  }
  return -1;
}

function upsertSession(list: AgentWorkspaceSession[], target: AgentWorkspaceSession): AgentWorkspaceSession[] {
  const next = [target, ...list.filter((item) => item.id !== target.id)];
  return next.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function AgentWorkspace({
  title = "intelligentAgent Console",
  description = "左侧会话历史，右侧对话面板",
  placeholder = "输入你的任务，按 Enter 发送（Shift+Enter 换行）",
  initialPrompt = "你是什么模型？你能做什么？",
  initialSessions = [],
  enableThemeToggle = true,
  modelOptions = [],
  selectedModelId,
  onModelChange,
  loadSessions,
  onSend,
  onSendStream
}: AgentWorkspaceProps) {
  const [sessions, setSessions] = React.useState<AgentWorkspaceSession[]>(initialSessions);
  const [activeSessionId, setActiveSessionId] = React.useState<string>(initialSessions[0]?.id ?? "");
  const [input, setInput] = React.useState(initialPrompt);
  const [composerAttachments, setComposerAttachments] = React.useState<Array<{ id: string; file: File; data: AttachmentData }>>([]);
  const [loading, setLoading] = React.useState(false);
  const [pendingSessionId, setPendingSessionId] = React.useState("");
  const [toolTimeline, setToolTimeline] = React.useState<ToolTimelineEntry[]>([]);
  const [toolsResolvedCount, setToolsResolvedCount] = React.useState<number | undefined>(undefined);
  const useStream = Boolean(onSendStream);
  const [historyLoading, setHistoryLoading] = React.useState(Boolean(loadSessions));
  const [historyError, setHistoryError] = React.useState("");
  const [error, setError] = React.useState("");
  const [theme, setTheme] = React.useState<"dark" | "light">("dark");
  const [previewAttachment, setPreviewAttachment] = React.useState<AttachmentData | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const composerAttachmentsRef = React.useRef<Array<{ id: string; file: File; data: AttachmentData }>>([]);
  const messagesEndRef = React.useRef<HTMLDivElement | null>(null);

  const activeSession = sessions.find((item) => item.id === activeSessionId) ?? null;
  const activeMessageCount = activeSession?.messages.length ?? 0;
  const isActiveSessionPending = loading && pendingSessionId === activeSessionId;

  React.useEffect(() => {
    composerAttachmentsRef.current = composerAttachments;
  }, [composerAttachments]);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem("intelligent-agent-theme");
    const next = saved === "light" ? "light" : "dark";
    setTheme(next);
  }, []);

  React.useEffect(() => {
    if (!loadSessions) return;
    let cancelled = false;

    setHistoryLoading(true);
    setHistoryError("");
    void loadSessions()
      .then((loadedSessions) => {
        if (cancelled) return;
        setSessions(loadedSessions);
        setActiveSessionId((current) => current || loadedSessions[0]?.id || "");
      })
      .catch((err) => {
        if (cancelled) return;
        setHistoryError(err instanceof Error ? err.message : "历史会话加载失败");
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [loadSessions]);

  React.useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(theme);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("intelligent-agent-theme", theme);
    }
  }, [theme]);

  React.useEffect(() => {
    return () => {
      for (const item of composerAttachmentsRef.current) {
        URL.revokeObjectURL(item.data.url);
      }
    };
  }, []);

  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [activeSessionId, activeMessageCount, loading, toolTimeline.length]);

  const ensureSession = React.useCallback(
    (seed?: string): AgentWorkspaceSession => {
      if (activeSession) return activeSession;
      const created = createSession(seed);
      setSessions((prev) => upsertSession(prev, created));
      setActiveSessionId(created.id);
      return created;
    },
    [activeSession]
  );

  const appendMessage = React.useCallback((session: AgentWorkspaceSession, message: AgentWorkspaceMessage): AgentWorkspaceSession => {
    return {
      ...session,
      title: session.messages.length === 0 && message.role === "user" ? message.content.slice(0, 24) : session.title,
      updatedAt: message.createdAt,
      messages: [...session.messages, message]
    };
  }, []);

  const runSend = React.useCallback(async () => {
    const message = input.trim();
    if (!message || loading) return;
    if (!onSendStream && !onSend) {
      setError("未配置消息发送处理器");
      return;
    }

    setError("");
    setLoading(true);
    setToolTimeline([]);
    setToolsResolvedCount(undefined);

    const session = ensureSession(message);
    const userMessage: AgentWorkspaceMessage = {
      id: newId("user"),
      role: "user",
      content: message,
      createdAt: nowIso(),
      attachments: composerAttachments.map((item) => item.data)
    };

    const pendingSession = appendMessage(session, userMessage);
    setSessions((prev) => upsertSession(prev, pendingSession));
    setPendingSessionId(pendingSession.id);
    setInput("");

    const selectedModel = modelOptions.find((m) => m.id === selectedModelId);
    const sendInput: AgentWorkspaceSendInput = {
      sessionId: pendingSession.id,
      message,
      attachments: composerAttachments.map((item) => item.data),
      files: composerAttachments.map((item) => item.file),
      provider: selectedModel?.provider,
      model: selectedModel?.model
    };

    try {
      let output = "";

      if (onSendStream) {
        let streamError: string | null = null;

        await onSendStream(sendInput, {
          onEvent: (event) => {
            switch (event.type) {
              case "tools_resolved":
                setToolsResolvedCount(event.count);
                break;
              case "tool_start":
                setToolTimeline((prev) => [
                  ...prev,
                  {
                    id: newId("tool"),
                    toolName: event.toolName,
                    status: "running"
                  }
                ]);
                break;
              case "tool_end":
                setToolTimeline((prev) => {
                  const next = [...prev];
                  const index = findLastRunningToolIndex(next, event.toolName);
                  if (index >= 0) {
                    next[index] = { ...next[index], status: "done", durationMs: event.durationMs };
                  }
                  return next;
                });
                break;
              case "tool_error":
                setToolTimeline((prev) => {
                  const next = [...prev];
                  const index = findLastRunningToolIndex(next, event.toolName);
                  if (index >= 0) {
                    next[index] = {
                      ...next[index],
                      status: "error",
                      error: event.error,
                      durationMs: event.durationMs
                    };
                  }
                  return next;
                });
                break;
              case "run_end":
                output = event.output;
                break;
              case "error":
                streamError = event.message;
                break;
              default:
                break;
            }
          }
        });

        if (streamError) {
          throw new Error(streamError);
        }
        if (!output) {
          throw new Error("流式响应未返回最终回答");
        }
      } else if (onSend) {
        output = await onSend(sendInput);
      }

      const assistantMessage: AgentWorkspaceMessage = {
        id: newId("assistant"),
        role: "assistant",
        content: output,
        createdAt: nowIso()
      };
      const completed = appendMessage(pendingSession, assistantMessage);
      setSessions((prev) => upsertSession(prev, completed));
      setActiveSessionId(completed.id);
      setComposerAttachments([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "unknown error");
      setSessions((prev) => upsertSession(prev, pendingSession));
      setActiveSessionId(pendingSession.id);
    } finally {
      setLoading(false);
      setPendingSessionId("");
      setToolTimeline([]);
      setToolsResolvedCount(undefined);
    }
  }, [appendMessage, composerAttachments, ensureSession, input, loading, modelOptions, onSend, onSendStream, selectedModelId]);

  const removeSession = React.useCallback((sessionId: string) => {
    setSessions((prev) => {
      const next = prev.filter((item) => item.id !== sessionId);
      setActiveSessionId((current) => (current === sessionId ? (next[0]?.id ?? "") : current));
      return next;
    });
  }, []);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-4 p-4 md:grid-cols-[300px_1fr]">
        <Card className="h-[calc(100vh-2rem)]">
          <CardHeader>
            <CardTitle>会话历史</CardTitle>
            <CardDescription>选择历史会话或创建新会话</CardDescription>
          </CardHeader>
          <CardContent className="flex h-[calc(100%-5.5rem)] flex-col gap-3">
            <Button
              variant="outline"
              onClick={() => {
                const session = createSession();
                setSessions((prev) => upsertSession(prev, session));
                setActiveSessionId(session.id);
              }}
            >
              新建会话
            </Button>
            <div className="space-y-2 overflow-x-hidden overflow-y-auto pr-1">
              {sessions.length === 0 ? (
                <p className="rounded-md border border-dashed border-border/50 p-3 text-xs text-foreground/60">
                  {historyLoading ? "正在加载历史会话" : "还没有历史会话"}
                </p>
              ) : null}
              {historyError ? (
                <p className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-600 dark:text-red-300">
                  {historyError}
                </p>
              ) : null}
              {sessions.map((session) => {
                return (
                  <div
                    key={session.id}
                    className={cn(
                      "flex items-start gap-2 rounded-md border border-border/60 p-2 transition-colors",
                      session.id === activeSessionId
                        ? "bg-foreground/10"
                        : "hover:bg-foreground/5"
                    )}
                  >
                    <button
                      className="min-w-0 flex-1 text-left"
                      onClick={() => setActiveSessionId(session.id)}
                      type="button"
                    >
                      <p className="truncate text-sm font-medium">{session.title || "未命名会话"}</p>
                    </button>
                    <button
                      type="button"
                      aria-label="删除会话"
                      className="inline-flex h-7 w-7 items-center justify-center rounded text-foreground/60 hover:bg-foreground/10 hover:text-foreground"
                      onClick={() => removeSession(session.id)}
                    >
                      ✕
                    </button>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card className="h-[calc(100vh-2rem)]">
          <CardHeader>
            <div className="flex items-start justify-between gap-2">
              <div>
                <CardTitle>{title}</CardTitle>
                <CardDescription>{description}</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                {modelOptions.length > 0 ? (
                  <select
                    className="rounded-md border border-input/70 bg-background px-3 py-1.5 text-sm text-foreground hover:bg-foreground/5 focus:outline-none focus:ring-2 focus:ring-ring"
                    value={selectedModelId || modelOptions[0]?.id || ""}
                    onChange={(e) => onModelChange?.(e.target.value)}
                    aria-label="选择模型"
                  >
                    {modelOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.name}
                      </option>
                    ))}
                  </select>
                ) : null}
                {enableThemeToggle ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setTheme((prev) => (prev === "dark" ? "light" : "dark"))}
                    aria-label="切换主题"
                  >
                    {theme === "dark" ? "浅色" : "深色"}
                  </Button>
                ) : null}
              </div>
            </div>
          </CardHeader>
          <CardContent className="grid h-[calc(100%-5.5rem)] grid-rows-[1fr_auto] gap-3">
            <div className="space-y-3 overflow-y-auto rounded-md border border-border/60 bg-background/40 p-3">
              {(activeSession?.messages.length ?? 0) === 0 ? (
                <p className="text-sm text-foreground/60">输入消息开始对话</p>
              ) : null}
              {activeSession?.messages.map((message) => (
                <div key={message.id} className={cn("flex", message.role === "user" ? "justify-end" : "justify-start")}>
                  <div
                    className={cn(
                      "max-w-[85%] space-y-2 rounded-lg px-3 py-2 text-sm",
                      message.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-foreground/10 text-foreground"
                    )}
                  >
                    {message.attachments && message.attachments.length > 0 ? (
                      <Attachments variant="inline">
                        {message.attachments.map((attachment, index) => (
                          <Attachment
                            key={`${message.id}-${index}`}
                            data={attachment}
                            variant="inline"
                            onOpenPreview={() => setPreviewAttachment(attachment)}
                            className={message.role === "user" ? "border-white/30 bg-white/20 text-white" : ""}
                          >
                            <AttachmentPreview />
                            <AttachmentInfo />
                          </Attachment>
                        ))}
                      </Attachments>
                    ) : null}
                    <div className="whitespace-pre-wrap">{message.content}</div>
                  </div>
                </div>
              ))}
              {isActiveSessionPending ? (
                useStream ? (
                  <StreamingAssistantPanel timeline={toolTimeline} toolsResolvedCount={toolsResolvedCount} />
                ) : (
                  <AssistantLoadingMessage />
                )
              ) : null}
              <div ref={messagesEndRef} />
            </div>

            <div className="space-y-2">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(event) => {
                  const files = Array.from(event.target.files ?? []);
                  if (files.length === 0) return;
                  setComposerAttachments((prev) => [
                    ...prev,
                    ...files.map((file) => ({
                      id: newId("file"),
                      file,
                      data: {
                        url: URL.createObjectURL(file),
                        filename: file.name,
                        mediaType: file.type,
                        size: file.size
                      }
                    }))
                  ]);
                  event.currentTarget.value = "";
                }}
              />

              {composerAttachments.length > 0 ? (
                <Attachments variant="inline">
                  {composerAttachments.map((item) => (
                    <Attachment
                      key={item.id}
                      data={item.data}
                      variant="inline"
                      onOpenPreview={() => setPreviewAttachment(item.data)}
                      onRemove={() => {
                        if (loading) return;
                        URL.revokeObjectURL(item.data.url);
                        setComposerAttachments((prev) => prev.filter((entry) => entry.id !== item.id));
                      }}
                    >
                      <AttachmentPreview />
                      <AttachmentInfo />
                      <AttachmentRemove />
                    </Attachment>
                  ))}
                </Attachments>
              ) : null}

              <Textarea
                placeholder={placeholder}
                value={input}
                disabled={loading}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void runSend();
                  }
                }}
              />
              <div className="flex items-center justify-between gap-2">
                {error ? (
                  <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
                ) : isActiveSessionPending ? (
                  <p className="text-xs text-foreground/55">请求处理中，请稍候</p>
                ) : (
                  <span />
                )}
                <div className="flex items-center gap-2">
                  <Button variant="outline" type="button" onClick={() => fileInputRef.current?.click()} disabled={loading}>
                    添加附件
                  </Button>
                  <Button onClick={() => void runSend()} disabled={loading || !input.trim()}>
                    {loading ? "等待回复" : "发送"}
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {previewAttachment ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setPreviewAttachment(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="w-full max-w-4xl rounded-lg border border-border/60 bg-card p-4 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="truncate text-sm font-medium">{previewAttachment.filename || previewAttachment.title || "附件预览"}</p>
              <div className="flex items-center gap-2">
                <a
                  href={previewAttachment.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-8 items-center rounded-md border border-input/70 px-3 text-xs hover:bg-foreground/10"
                >
                  新窗口打开
                </a>
                <button
                  type="button"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-input/70 text-sm hover:bg-foreground/10"
                  onClick={() => setPreviewAttachment(null)}
                  aria-label="关闭预览"
                >
                  ✕
                </button>
              </div>
            </div>

            {previewAttachment.mediaType?.startsWith("image/") ? (
              <img
                src={previewAttachment.url}
                alt={previewAttachment.filename || "attachment preview"}
                className="max-h-[70vh] w-full rounded-md object-contain"
              />
            ) : (
              <div className="rounded-md border border-dashed border-border/55 p-6 text-sm text-foreground/75">
                <p>该附件类型暂不支持内嵌大图预览。</p>
                <p className="mt-1 text-xs text-foreground/60">类型：{previewAttachment.mediaType || "unknown"}</p>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </main>
  );
}
