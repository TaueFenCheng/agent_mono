import { describe, expect, it } from "vitest";
import { runSubagents } from "../ts/subagent.js";

describe("subagent orchestrator", () => {
  it("uses isolated sub-thread ids and keeps partial results on failure", async () => {
    const output = await runSubagents(
      {
        threadId: "thread-main",
        runId: "run-1",
        tasks: [
          { taskId: "a", role: "researcher", prompt: "ok task" },
          { taskId: "b", role: "coder", prompt: "fail task" }
        ]
      },
      {
        invoke: async (input) => {
          if (input.prompt.includes("fail task")) {
            throw new Error("boom");
          }
          return {
            output: "done",
            provider: "qwen",
            messages: [],
            toolCount: 1,
            checkpointId: "cp-1",
            threadId: input.threadId
          };
        }
      },
      {
        defaultMaxConcurrency: 2,
        defaultTaskTimeoutMs: 1000,
        maxTasksPerRun: 8,
        failurePolicy: "continue_on_error"
      }
    );

    expect(output.results).toHaveLength(2);
    expect(output.partial).toBe(true);
    expect(output.succeededTasks).toHaveLength(1);
    expect(output.failedTasks).toHaveLength(1);
    expect(output.results[0]?.threadId).toContain("thread-main:sub:run-1:a");
    expect(output.results[1]?.threadId).toContain("thread-main:sub:run-1:b");
  });

  it("marks timeout status when subagent exceeds timeout", async () => {
    const output = await runSubagents(
      {
        threadId: "thread-timeout",
        runId: "run-timeout",
        tasks: [{ taskId: "slow", role: "researcher", prompt: "slow task" }],
        taskTimeoutMs: 500
      },
      {
        invoke: async () => {
          await new Promise((resolve) => setTimeout(resolve, 650));
          return {
            output: "late",
            provider: "qwen",
            messages: [],
            toolCount: 0,
            checkpointId: null,
            threadId: "x"
          };
        }
      },
      {
        defaultMaxConcurrency: 1,
        defaultTaskTimeoutMs: 1000,
        maxTasksPerRun: 8,
        failurePolicy: "continue_on_error"
      }
    );

    expect(output.failedTasks[0]?.status).toBe("timed_out");
  });
});
