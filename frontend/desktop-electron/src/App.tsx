import { AgentWorkspace } from "@tang-agent/ui";

const apiBaseUrl = import.meta.env.VITE_AGENT_API_BASE_URL ?? "http://127.0.0.1:8080";

export function App() {
  return (
    <AgentWorkspace
      title="tangAgent Desktop Console"
      description="左侧会话区历史记录，右侧对话沟通面板（Electron）"
      onSend={async ({ sessionId, message }) => {
        const response = await fetch(`${apiBaseUrl}/v1/agents/runs`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            threadId: sessionId,
            messages: [{ role: "user", content: message, createdAt: new Date().toISOString() }]
          })
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = (await response.json()) as { output: string };
        return data.output;
      }}
    />
  );
}
