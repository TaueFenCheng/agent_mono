export type AgentRunEvent =
  | {
      type: "run_start";
      runId: string;
      threadId: string;
      at: string;
    }
  | {
      type: "model_selected";
      provider: string;
      model: string;
      baseUrl: string;
      temperature: number;
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
      type: "plan_created";
      runId: string;
      threadId: string;
      taskCount: number;
      at: string;
    }
  | {
      type: "subagent_start";
      runId: string;
      threadId: string;
      taskId: string;
      role: string;
      subThreadId: string;
      at: string;
    }
  | {
      type: "subagent_end";
      runId: string;
      threadId: string;
      taskId: string;
      role: string;
      subThreadId: string;
      status: "succeeded" | "failed" | "timed_out";
      durationMs: number;
      at: string;
    }
  | {
      type: "subagent_error";
      runId: string;
      threadId: string;
      taskId: string;
      role: string;
      subThreadId: string;
      message: string;
      at: string;
    }
  | {
      type: "reasoning_delta";
      runId: string;
      threadId: string;
      text: string;
      at: string;
    }
  | {
      type: "text_delta";
      runId: string;
      threadId: string;
      text: string;
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
      runId: string;
      threadId: string;
      message: string;
      at: string;
    };

interface QueueState<T> {
  items: T[];
  resolvers: Array<(item: IteratorResult<T>) => void>;
  closed: boolean;
}

export class AsyncEventQueue<T> {
  private readonly state: QueueState<T> = {
    items: [],
    resolvers: [],
    closed: false
  };

  push(item: T): void {
    if (this.state.closed) return;
    const resolver = this.state.resolvers.shift();
    if (resolver) {
      resolver({ done: false, value: item });
      return;
    }
    this.state.items.push(item);
  }

  end(): void {
    this.state.closed = true;
    while (this.state.resolvers.length > 0) {
      const resolver = this.state.resolvers.shift();
      if (resolver) resolver({ done: true, value: undefined });
    }
  }

  async next(): Promise<IteratorResult<T>> {
    if (this.state.items.length > 0) {
      const value = this.state.items.shift() as T;
      return { done: false, value };
    }
    if (this.state.closed) {
      return { done: true, value: undefined };
    }
    return new Promise<IteratorResult<T>>((resolve) => {
      this.state.resolvers.push(resolve);
    });
  }
}
