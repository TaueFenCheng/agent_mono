import { describe, it, expect, vi } from "vitest";
import { TangAgentClient } from "../src/index";

describe("TangAgentClient", () => {
  it("calls run endpoint", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ runId: "r1", output: "ok", provider: "mock", createdAt: new Date().toISOString() })
    });

    vi.stubGlobal("fetch", mockFetch as unknown as typeof fetch);

    const client = new TangAgentClient({ baseUrl: "http://localhost:8080" });
    const result = await client.runAgent({
      sessionId: "s1",
      messages: [{ role: "user", content: "hello", createdAt: new Date().toISOString() }]
    });

    expect(result.runId).toBe("r1");
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
