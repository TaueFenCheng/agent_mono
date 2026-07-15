import { describe, expect, it, vi } from "vitest";
import { createAgentRuntime } from "../ts/runtime";
import { SkillRegistry } from "../ts/skills";

describe("AgentRuntime", () => {
  it("injects core dependencies and delegates skill access", () => {
    const skillRegistry = new SkillRegistry();
    const runtime = createAgentRuntime({ skillRegistry });

    expect(runtime.core).toBeDefined();
    expect(runtime.listSkills()).toEqual(skillRegistry.listSkills());
  });

  it("closes injected resources at most once", async () => {
    const close = vi.fn(async () => {});
    const runtime = createAgentRuntime({ close });

    await runtime.close();
    await runtime.close();

    expect(close).toHaveBeenCalledTimes(1);
  });
});
