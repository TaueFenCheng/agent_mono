import { tool, type StructuredToolInterface } from "@langchain/core/tools";
import { z } from "zod";
import type { McpServiceMap, McpToolPlugin, McpToolPluginLoadContext, ToolInvocationContext } from "./types.js";
import { toDisplayString } from "./utils/value-utils.js";

export interface McpToolDescriptor<TSchema extends z.ZodTypeAny = z.ZodTypeAny> {
  name: string;
  description: string;
  schema: TSchema;
  invoke: (
    input: z.infer<TSchema>,
    context: ToolInvocationContext & { services?: McpServiceMap }
  ) => Promise<unknown> | unknown;
}

export function createMcpTool<TSchema extends z.ZodTypeAny>(
  descriptor: McpToolDescriptor<TSchema>,
  context: ToolInvocationContext = {},
  services?: McpServiceMap
): StructuredToolInterface {
  return tool(
    async (input) => {
      const result = await descriptor.invoke(input, { ...context, services });
      return toDisplayString(result);
    },
    {
      name: descriptor.name,
      description: descriptor.description,
      schema: descriptor.schema
    }
  );
}

export class StaticMcpToolPlugin implements McpToolPlugin {
  constructor(
    public readonly name: string,
    private readonly descriptors: McpToolDescriptor[]
  ) {}

  async loadTools(context: McpToolPluginLoadContext = { invocationContext: {} }): Promise<StructuredToolInterface[]> {
    return this.descriptors.map((descriptor) =>
      createMcpTool(descriptor, context.invocationContext, context.services)
    );
  }
}
