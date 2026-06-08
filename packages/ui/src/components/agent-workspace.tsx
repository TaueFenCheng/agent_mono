"use client";

import * as React from "react";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Textarea } from "./ui/textarea";
import { Attachment, AttachmentInfo, Attachments, AttachmentPreview, AttachmentRemove, type AttachmentData } from "./ui/attachments";
import { cn } from "../lib/utils";

type MessageRole = "user" | "assistant";

interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  createdAt: string;
  attachments?: AttachmentData[];
}

interface ChatSession {
  id: string;
  title: string;
  updatedAt: string;
  messages: ChatMessage[];
}

export interface AgentWorkspaceSendInput {
  sessionId: string;
  message: string;
  attachments?: AttachmentData[];
  files?: File[];
}

export interface AgentWorkspaceProps {
  title?: string;
  description?: string;
  placeholder?: string;
  initialPrompt?: string;
  enableThemeToggle?: boolean;
  onSend: (input: AgentWorkspaceSendInput) => Promise<string>;
}

function nowIso() {
  return new Date().toISOString();
}

function newId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createSession(seed?: string): ChatSession {
  return {
    id: newId("thread"),
    title: (seed && seed.trim().slice(0, 24)) || "新会话",
    updatedAt: nowIso(),
    messages: []
  };
}

function upsertSession(list: ChatSession[], target: ChatSession): ChatSession[] {
  const next = [target, ...list.filter((item) => item.id !== target.id)];
  return next.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function AgentWorkspace({
  title = "tangAgent Console",
  description = "左侧会话历史，右侧对话面板",
  placeholder = "输入你的任务，按 Enter 发送（Shift+Enter 换行）",
  initialPrompt = "帮我设计一个可扩展的多模型 agent 架构",
  enableThemeToggle = true,
  onSend
}: AgentWorkspaceProps) {
  const [sessions, setSessions] = React.useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = React.useState<string>("");
  const [input, setInput] = React.useState(initialPrompt);
  const [composerAttachments, setComposerAttachments] = React.useState<Array<{ id: string; file: File; data: AttachmentData }>>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");
  const [theme, setTheme] = React.useState<"dark" | "light">("dark");
  const [previewAttachment, setPreviewAttachment] = React.useState<AttachmentData | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const composerAttachmentsRef = React.useRef<Array<{ id: string; file: File; data: AttachmentData }>>([]);

  const activeSession = sessions.find((item) => item.id === activeSessionId) ?? null;

  React.useEffect(() => {
    composerAttachmentsRef.current = composerAttachments;
  }, [composerAttachments]);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem("tang-agent-theme");
    const next = saved === "light" ? "light" : "dark";
    setTheme(next);
  }, []);

  React.useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(theme);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("tang-agent-theme", theme);
    }
  }, [theme]);

  React.useEffect(() => {
    return () => {
      for (const item of composerAttachmentsRef.current) {
        URL.revokeObjectURL(item.data.url);
      }
    };
  }, []);

  const ensureSession = React.useCallback(
    (seed?: string): ChatSession => {
      if (activeSession) return activeSession;
      const created = createSession(seed);
      setSessions((prev) => upsertSession(prev, created));
      setActiveSessionId(created.id);
      return created;
    },
    [activeSession]
  );

  const appendMessage = React.useCallback((session: ChatSession, message: ChatMessage): ChatSession => {
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
    setError("");
    setLoading(true);

    const session = ensureSession(message);
    const userMessage: ChatMessage = {
      id: newId("user"),
      role: "user",
      content: message,
      createdAt: nowIso(),
      attachments: composerAttachments.map((item) => item.data)
    };

    const pendingSession = appendMessage(session, userMessage);
    setSessions((prev) => upsertSession(prev, pendingSession));
    setInput("");

    try {
      const output = await onSend({
        sessionId: pendingSession.id,
        message,
        attachments: composerAttachments.map((item) => item.data),
        files: composerAttachments.map((item) => item.file)
      });
      const assistantMessage: ChatMessage = {
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
    }
  }, [activeSessionId, appendMessage, ensureSession, input, loading, onSend]);

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
                <p className="rounded-md border border-dashed border-border/50 p-3 text-xs text-foreground/60">还没有历史会话</p>
              ) : null}
              {sessions.map((session) => {
                const latest = session.messages[session.messages.length - 1];
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
                      <p className="mt-1 max-h-9 overflow-hidden text-xs text-foreground/55">
                        {latest?.content ?? "暂无消息"}
                      </p>
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
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void runSend();
                  }
                }}
              />
              <div className="flex items-center justify-between gap-2">
                {error ? <p className="text-xs text-red-600 dark:text-red-400">{error}</p> : <span />}
                <div className="flex items-center gap-2">
                  <Button variant="outline" type="button" onClick={() => fileInputRef.current?.click()} disabled={loading}>
                    添加附件
                  </Button>
                  <Button onClick={() => void runSend()} disabled={loading || !input.trim()}>
                    {loading ? "发送中..." : "发送"}
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
