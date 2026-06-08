"use client";

import { AgentWorkspace } from "@tang-agent/ui";

/**
 * 客户端包装组件
 * - AgentWorkspace 需要客户端交互（onClick 等）
 * - 将客户端逻辑隔离在此，page.tsx 可保持为 Server Component
 */
export function AgentWorkspaceWrapper() {
  return (
    <AgentWorkspace
      title="tangAgent Web Console"
      description="左侧会话区历史记录，右侧对话沟通面板"
      onSend={async ({ sessionId, message }) => {
        const response = await fetch("/api/agent-run", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ threadId: sessionId, message })
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = (await response.json()) as { output: string };
        return data.output;
      }}
    />
  );
}
