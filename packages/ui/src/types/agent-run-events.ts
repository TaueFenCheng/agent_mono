/** Subset of core/agent-core-ts/ts/events.ts AgentRunEvent for Web SSE UI */
export type AgentRunEvent =
  | {
      type: "run_start";
      runId: string;
      threadId: string;
      at: string;
    }
  | {
      type: "tools_resolved";
      toolNames: string[];
      count: number;
      at: string;
    }
  | {
      type: "tool_start";
      toolName: string;
      input: unknown;
      threadId?: string;
      at: string;
    }
  | {
      type: "tool_end";
      toolName: string;
      input: unknown;
      output: unknown;
      durationMs: number;
      threadId?: string;
      at: string;
    }
  | {
      type: "tool_error";
      toolName: string;
      input: unknown;
      error: string;
      durationMs: number;
      threadId?: string;
      at: string;
    }
  | {
      type: "run_end";
      runId: string;
      threadId: string;
      provider: string;
      output: string;
      checkpointId?: string | null;
      toolCount: number;
      at: string;
    }
  | {
      type: "error";
      runId?: string;
      threadId?: string;
      message: string;
      at: string;
    };
