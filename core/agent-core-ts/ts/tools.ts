import { tool, type StructuredToolInterface } from "@langchain/core/tools";
import { z } from "zod";
import type {
  AgentToolRegistry,
  BuildToolOptions,
  LocalToolSpec,
  McpPluginInfo,
  McpToolPlugin,
  McpToolPluginLoadContext,
  ToolInvocationContext
} from "./types.js";
import { ToolExecutionCoordinator, wrapToolWithPolicy } from "./utils/tool-execution.js";
import { toDisplayString } from "./utils/value-utils.js";

function createBuiltinTools(options: BuildToolOptions, context: ToolInvocationContext): StructuredToolInterface[] {
  return [
    tool(async () => toDisplayString({ now: new Date().toISOString() }), {
      name: "get_time",
      description: "Get current ISO datetime in UTC.",
      schema: z.object({})
    }),
    tool(async (input: { text: string }) => toDisplayString({ echoed: input.text }), {
      name: "echo_text",
      description: "Echo input text for testing tool-calling behavior.",
      schema: z.object({ text: z.string().describe("Text to echo") })
    }),
    tool(async (input: { expression: string }) => {
      const safe = /^[0-9+\-*/().\s]+$/.test(input.expression);
      if (!safe) throw new Error("Expression contains unsupported characters");
      const result = Function(`"use strict"; return (${input.expression});`)();
      if (typeof result !== "number" || Number.isNaN(result)) throw new Error("Invalid expression result");
      return toDisplayString({ result });
    }, {
      name: "calculate",
      description: "Calculate a simple arithmetic expression using + - * / and parentheses.",
      schema: z.object({ expression: z.string().describe("Expression, e.g. (12+3)*4") })
    }),
    tool(async (input: { content: string; category?: string; confidence?: number }) => {
      if (!options.memoryStore) return "Memory store is not configured.";
      if (!context.threadId) throw new Error("threadId is required for memory operations");
      const fact = await options.memoryStore.createFact(context.threadId, {
        content: input.content,
        category: input.category,
        confidence: input.confidence,
        metadata: context.metadata
      });
      return toDisplayString({
        id: fact.id,
        thread_id: fact.threadId,
        content: fact.content,
        category: fact.category,
        confidence: fact.confidence
      });
    }, {
      name: "remember_fact",
      description: "Persist a fact into thread memory for later turns.",
      schema: z.object({
        content: z.string().describe("Fact to remember for this thread"),
        category: z.string().default("context").describe("Memory fact category"),
        confidence: z.number().min(0).max(1).default(0.7).describe("Confidence score")
      })
    }),
    tool(async () => {
      if (!options.memoryStore) return "Memory store is not configured.";
      if (!context.threadId) throw new Error("threadId is required for memory operations");
      const facts = await options.memoryStore.listFacts(context.threadId, { limit: 20 });
      return toDisplayString(facts.map((fact) => ({
        id: fact.id,
        thread_id: fact.threadId,
        content: fact.content,
        category: fact.category,
        confidence: fact.confidence
      })));
    }, {
      name: "list_memory",
      description: "List saved memory facts for the current thread.",
      schema: z.object({})
    }),
    tool(async () => {
      if (!options.skillRegistry) return "Skill registry is not configured.";
      return toDisplayString(options.skillRegistry.listSkills({
        enabledOnly: Boolean(options.enabledSkills?.length),
        enabledNames: options.enabledSkills
      }));
    }, {
      name: "list_skills",
      description: "List the available skills and their summaries.",
      schema: z.object({})
    }),
    tool(async (input: { name: string }) => {
      if (!options.skillRegistry) return { message: "Skill registry is not configured." };
      const skill = options.skillRegistry.getSkill(input.name);
      if (!skill) throw new Error(`Skill not found: ${input.name}`);
      return skill.content;
    }, {
      name: "read_skill",
      description: "Read the full content of a skill by name.",
      schema: z.object({ name: z.string().describe("Skill name") })
    })
  ];
}

export class DefaultAgentToolRegistry implements AgentToolRegistry {
  private readonly structuredTools = new Map<string, StructuredToolInterface>();
  private readonly localTools: Array<LocalToolSpec> = [];
  private readonly mcpPlugins = new Map<string, McpToolPlugin>();

  registerLocalTool<TSchema extends z.ZodTypeAny>(spec: LocalToolSpec<TSchema>): this {
    this.localTools.push(spec as unknown as LocalToolSpec);
    return this;
  }

  registerStructuredTool(toolDef: StructuredToolInterface): this {
    this.structuredTools.set(toolDef.name, toolDef);
    return this;
  }

  useMcpPlugin(plugin: McpToolPlugin): this {
    this.mcpPlugins.set(plugin.name, plugin);
    return this;
  }

  listMcpPlugins(): McpPluginInfo[] {
    return [...this.mcpPlugins.keys()].sort().map((name) => ({ name }));
  }

  async buildMcpTools(context: McpToolPluginLoadContext = { invocationContext: {} }): Promise<Array<{ plugin: string; tool: StructuredToolInterface }>> {
    const loaded: Array<{ plugin: string; tool: StructuredToolInterface }> = [];
    for (const plugin of this.mcpPlugins.values()) {
      const tools = await plugin.loadTools(context);
      for (const toolDef of tools) {
        loaded.push({ plugin: plugin.name, tool: toolDef });
      }
    }
    return loaded;
  }

  async buildTools(options: BuildToolOptions = {}): Promise<StructuredToolInterface[]> {
    const tools = new Map<string, StructuredToolInterface>();
    const executionCoordinator = new ToolExecutionCoordinator();
    const context: ToolInvocationContext = { threadId: options.threadId, runId: options.runId, metadata: options.metadata };

    for (const [name, existingTool] of this.structuredTools.entries()) {
      tools.set(name, wrapToolWithPolicy(existingTool, options, executionCoordinator));
    }

    for (const builtin of createBuiltinTools(options, context)) {
      tools.set(builtin.name, wrapToolWithPolicy(builtin, options, executionCoordinator));
    }

    for (const local of this.localTools) {
      const dynamicTool = tool(
        async (input) => {
          const result = await local.invoke(input, context);
          return toDisplayString(result);
        },
        {
          name: local.name,
          description: local.description,
          schema: local.schema
        }
      );
      tools.set(dynamicTool.name, wrapToolWithPolicy(dynamicTool, options, executionCoordinator, local));
    }

    const mcpTools = await this.buildMcpTools({
      invocationContext: context,
      services: options.mcpServices
    });
    for (const loaded of mcpTools) {
      tools.set(loaded.tool.name, wrapToolWithPolicy(loaded.tool, options, executionCoordinator));
    }

    const allTools = [...tools.values()];
    if (!options.toolAllowlist || options.toolAllowlist.length === 0) {
      return allTools;
    }
    const allow = new Set(options.toolAllowlist.map((item) => item.trim()).filter(Boolean));
    return allTools.filter((item) => allow.has(item.name));
  }
}

export function registerBuiltinTools(registry: AgentToolRegistry): AgentToolRegistry {
  return registry;
}
