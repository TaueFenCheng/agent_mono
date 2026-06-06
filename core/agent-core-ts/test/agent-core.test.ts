import path from "node:path";
import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { END, START, MessagesAnnotation, StateGraph } from "@langchain/langgraph";
import { describe, expect, it } from "vitest";
import { createCheckpointerManager, getThreadCheckpoints, listThreads } from "../ts/checkpointer.js";
import { InMemoryMemoryStore } from "../ts/memory.js";
import { SkillRegistry } from "../ts/skills.js";

describe("agent-core-ts advanced capabilities", () => {
  it("loads repo skills", () => {
    const registry = new SkillRegistry(path.resolve("/Users/tangjiaqiang/code/tangAgent/skills"));
    const skills = registry.listSkills();
    expect(skills.some((skill) => skill.name === "engineering-default")).toBe(true);
  });

  it("stores memory facts in memory", async () => {
    const store = new InMemoryMemoryStore();
    const fact = await store.createFact("thread-1", { content: "remember this" });
    const facts = await store.listFacts("thread-1");

    expect(facts[0]?.id).toBe(fact.id);
    await expect(store.renderPromptContext("thread-1")).resolves.toContain("remember this");
  });

  it("keeps multi-turn checkpoint history", async () => {
    const manager = await createCheckpointerManager({ backend: "memory" });

    try {
      const builder = new StateGraph(MessagesAnnotation);
      builder.addNode("reply", async (state) => ({
        messages: [new AIMessage(`echo:${state.messages.at(-1)?.content ?? ""}`)]
      }));
      builder.addEdge(START, "reply");
      builder.addEdge("reply", END);

      const graph = builder.compile({ checkpointer: manager.saver });
      await graph.invoke(
        { messages: [new HumanMessage("hello")] },
        { configurable: { thread_id: "thread-1" } }
      );
      await graph.invoke(
        { messages: [new HumanMessage("again")] },
        { configurable: { thread_id: "thread-1" } }
      );

      const threads = await listThreads(manager.saver, 10);
      const checkpoints = await getThreadCheckpoints(manager.saver, "thread-1");
      const lastContent = (checkpoints.at(-1)?.values.messages as Array<{ content?: string }>)?.at(-1)?.content;

      expect(threads[0]?.thread_id).toBe("thread-1");
      expect(checkpoints.length).toBeGreaterThan(1);
      expect(typeof lastContent).toBe("string");
      expect(lastContent).toContain("again");
    } finally {
      await manager.close();
    }
  });
});
