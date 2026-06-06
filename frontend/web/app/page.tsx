"use client";

import { HealthStatusPanel } from "@/components/health-status-panel";
import { AgentWorkspace } from "@tang-agent/ui";

export default function HomePage() {
  return (
    <div className="space-y-4 p-4">
      <HealthStatusPanel />
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
    </div>
  );
}
