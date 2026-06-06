import { describe, expect, it } from "vitest";
import { AgentCore } from "../ts/agent.js";
import { createAgentEventStream, EventStream } from "../ts/event-stream.js";
import type { AgentInvokeOutput } from "../ts/types.js";

describe("EventStream", () => {
  it("yields events in order and resolves the final result", async () => {
    const stream = new EventStream<number, string>();

    queueMicrotask(() => {
      stream.push(1);
      stream.push(2);
      stream.complete("done", 3);
    });

    const events: number[] = [];
    for await (const event of stream) {
      events.push(event);
    }

    expect(events).toEqual([1, 2, 3]);
    await expect(stream.result()).resolves.toBe("done");
  });

  it("rejects the final result and still emits the terminal error event", async () => {
    const stream = createAgentEventStream<string>();

    queueMicrotask(() => {
      stream.push({
        type: "run_start",
        runId: "run-1",
        threadId: "thread-1",
        at: "2026-06-02T00:00:00.000Z"
      });
      stream.fail(new Error("boom"), {
        type: "error",
        runId: "run-1",
        threadId: "thread-1",
        message: "boom",
        at: "2026-06-02T00:00:01.000Z"
      });
    });

    const events = [];
    for await (const event of stream) {
      events.push(event.type);
    }

    expect(events).toEqual(["run_start", "error"]);
    await expect(stream.result()).rejects.toThrow("boom");
  });
});

describe("AgentCore stream compatibility", () => {
  it("keeps invokeStream compatible with AsyncGenerator consumers", async () => {
    const core = new AgentCore();
    const finalResult: AgentInvokeOutput = {
      output: "done",
      provider: "qwen",
      messages: [],
      toolCount: 0,
      checkpointId: null,
      threadId: "thread-1"
    };

    (core as AgentCore & { invokeEventStream: typeof core.invokeEventStream }).invokeEventStream = () => {
      const stream = createAgentEventStream<AgentInvokeOutput>();
      queueMicrotask(() => {
        stream.push({
          type: "run_start",
          runId: "run-1",
          threadId: "thread-1",
          at: "2026-06-02T00:00:00.000Z"
        });
        stream.complete(finalResult, {
          type: "run_end",
          runId: "run-1",
          threadId: "thread-1",
          provider: "qwen",
          output: "done",
          checkpointId: null,
          toolCount: 0,
          at: "2026-06-02T00:00:01.000Z"
        });
      });
      return stream;
    };

    const generator = core.invokeStream({
      prompt: "test",
      threadId: "thread-1"
    });

    const events = [];
    let next = await generator.next();
    while (!next.done) {
      events.push(next.value.type);
      next = await generator.next();
    }

    expect(events).toEqual(["run_start", "run_end"]);
    expect(next.value).toEqual(finalResult);
  });
});
