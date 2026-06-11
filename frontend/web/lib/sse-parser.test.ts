import { describe, expect, it } from "vitest";
import { parseSseBuffer } from "./sse-parser";

describe("parseSseBuffer", () => {
  it("parses complete SSE data lines", () => {
    const buffer =
      'data: {"type":"run_start","runId":"r1","threadId":"t1","at":"2026-01-01T00:00:00.000Z"}\n\n' +
      'data: {"type":"tool_start","toolName":"get_time","input":{},"at":"2026-01-01T00:00:01.000Z"}\n\n';

    const { events, remainder } = parseSseBuffer(buffer);

    expect(remainder).toBe("");
    expect(events).toHaveLength(2);
    expect(events[0]?.type).toBe("run_start");
    expect(events[1]?.type).toBe("tool_start");
    if (events[1]?.type === "tool_start") {
      expect(events[1].toolName).toBe("get_time");
    }
  });

  it("keeps partial line in remainder", () => {
    const partial = 'data: {"type":"run_end","runId":"r1","threadId":"t1","provider":"qwen","output":"hi","toolCount":0,"at":"2026-01-01T00:00:02.000Z"}';
    const { events, remainder } = parseSseBuffer(partial);

    expect(events).toHaveLength(0);
    expect(remainder).toBe(partial);
  });

  it("skips malformed JSON lines", () => {
    const buffer =
      'data: not-json\n\n' +
      'data: {"type":"run_end","runId":"r1","threadId":"t1","provider":"qwen","output":"ok","toolCount":0,"at":"2026-01-01T00:00:02.000Z"}\n\n';

    const { events } = parseSseBuffer(buffer);

    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe("run_end");
  });
});
