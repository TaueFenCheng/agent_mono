"use client";

import { AgentWorkspace } from "@tang-agent/ui";

interface AgentWorkspaceWrapperProps {
  accessToken: string;
  onUnauthorized?: () => void;
}

/**
 * 客户端包装组件
 * - AgentWorkspace 需要客户端交互（onClick 等）
 * - 将客户端逻辑隔离在此，page.tsx 可保持为 Server Component
 */
export function AgentWorkspaceWrapper({ accessToken, onUnauthorized }: AgentWorkspaceWrapperProps) {
  const authHeaders = {
    authorization: `Bearer ${accessToken}`
  };

  const assertOk = (response: Response) => {
    if (response.status === 401) {
      onUnauthorized?.();
      throw new Error("登录已失效");
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
  };

  return (
    <AgentWorkspace
      title="tangAgent Web Console"
      description="左侧会话区历史记录，右侧对话沟通面板"
      loadSessions={async () => {
        const response = await fetch("/api/threads", {
          headers: authHeaders,
          cache: "no-store"
        });
        assertOk(response);
        const data = (await response.json()) as { sessions: Parameters<typeof AgentWorkspace>[0]["initialSessions"] };
        return data.sessions ?? [];
      }}
      onSend={async ({ sessionId, message }) => {
        const response = await fetch("/api/agent-run", {
          method: "POST",
          headers: { "content-type": "application/json", ...authHeaders },
          body: JSON.stringify({ threadId: sessionId, message })
        });
        assertOk(response);
        const data = (await response.json()) as { output: string };
        return data.output;
      }}
    />
  );
}
