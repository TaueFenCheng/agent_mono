import { describe, it, expect, vi } from "vitest";
import { AgentService } from "../src/agent/agent.service";

describe("AgentService", () => {
  it("returns cached output when redis hit", async () => {
    const db = { appendRunRecord: vi.fn() } as any;
    const redis = {
      getCachedOutput: vi.fn().mockResolvedValue("cached answer"),
      setCachedOutput: vi.fn()
    } as any;
    const queue = {} as any;
    const ragRetrieval = {
      retrieve: vi.fn().mockResolvedValue({
        systemContext: "",
        cacheSignature: "none",
        hitCount: 0
      })
    } as any;

    const service = new AgentService(db, redis, queue, ragRetrieval);
    const response = await service.run({
      sessionId: "s1",
      messages: [{ role: "user", content: "hello", createdAt: new Date().toISOString() }]
    });

    expect(response.cached).toBe(true);
    expect(response.output).toBe("cached answer");
    expect(ragRetrieval.retrieve).toHaveBeenCalledWith("hello", "s1");
    expect(db.appendRunRecord).not.toHaveBeenCalled();
  });
});
