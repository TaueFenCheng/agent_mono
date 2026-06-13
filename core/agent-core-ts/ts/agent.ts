import { AIMessage, HumanMessage, type BaseMessage } from "@langchain/core/messages";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import type { StreamMode } from "@langchain/langgraph";
import { getLatestCheckpointId, getThread, listThreads } from "./checkpointer.js";
import { createAgentEventStream, type AgentEventStream } from "./event-stream.js";
import type { AgentRunEvent } from "./events.js";
import { getProviderRegistry, type ProviderRegistry } from "./provider-router.js";
import { SkillRegistry } from "./skills.js";
import { runSubagents } from "./subagent.js";
import type {
  AgentCoreOptions,
  AgentInvokeInput,
  AgentInvokeOutput,
  AgentToolRegistry,
  McpPluginInfo,
  McpToolInfo,
  SubagentRunInput,
  SubagentRunOutput
} from "./types.js";
import { DefaultAgentToolRegistry, registerBuiltinTools } from "./tools.js";

function extractLastAssistantText(messages: BaseMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message instanceof AIMessage) {
      const content = message.content;
      if (typeof content === "string") return content;
      if (Array.isArray(content)) {
        return content
          .map((part) => {
            if (part && typeof part === "object" && "text" in part && typeof (part as { text?: unknown }).text === "string") {
              return (part as { text: string }).text;
            }
            return String(part);
          })
          .join("\n")
          .trim();
      }
      return String(content ?? "");
    }
  }
  return "";
}

export class AgentCore {
  private readonly registry: AgentToolRegistry;
  private readonly skillRegistry: SkillRegistry;
  private readonly providerRegistry: ProviderRegistry;

  constructor(private readonly options: AgentCoreOptions = {}) {
    this.registry = options.toolRegistry ?? registerBuiltinTools(new DefaultAgentToolRegistry());
    this.skillRegistry = (options.skillRegistry as SkillRegistry | undefined) ?? new SkillRegistry();
    this.providerRegistry = getProviderRegistry();
  }

  async invoke(input: AgentInvokeInput): Promise<AgentInvokeOutput> {
    const routed = this.providerRegistry.createRoutedModel({
      provider: input.provider ?? this.options.defaultProvider,
      model: input.model ?? this.options.defaultModel,
      env: this.options.env,
      providerConfigs: { ...this.options.providerConfigs, ...input.providerConfigs }
    });

    const tools = await this.registry.buildTools({
      threadId: input.threadId,
      runId: input.runId,
      metadata: input.metadata,
      enabledSkills: input.enabledSkills,
      memoryStore: this.options.memoryStore,
      skillRegistry: this.skillRegistry,
      executionPolicy: this.options.toolExecutionPolicy,
      mcpServices: this.options.mcpServices,
      toolAllowlist: input.toolAllowlist
    });
    const promptSections = [
      this.options.systemPrompt ??
        process.env.AGENT_SYSTEM_PROMPT ??
        "You are a pragmatic software engineering agent. Use tools when needed and keep answers concrete."
    ];

    if (this.options.memoryStore) {
      const memoryContext = await this.options.memoryStore.renderPromptContext(input.threadId, { limit: 20 });
      if (memoryContext) promptSections.push(memoryContext);
    }

    const skillContext = this.skillRegistry.renderPromptContext({ enabledNames: input.enabledSkills });
    if (skillContext) promptSections.push(skillContext);

    const graph = createReactAgent({
      llm: routed.chatModel,
      tools,
      prompt: promptSections.join("\n\n"),
      checkpointer: this.options.checkpointSaver,
      name: "intelligent-agent-core"
    });

    const state = await graph.invoke(
      {
        messages: [...(input.messages ?? []), new HumanMessage(input.prompt)]
      },
      {
        configurable: {
          thread_id: input.threadId,
          run_id: input.runId ?? input.threadId
        }
      }
    );

    const messages = state.messages as BaseMessage[];
    return {
      output: extractLastAssistantText(messages),
      provider: routed.provider,
      messages,
      toolCount: tools.length,
      checkpointId: this.options.checkpointSaver ? await getLatestCheckpointId(this.options.checkpointSaver, input.threadId) : null,
      threadId: input.threadId
    };
  }

  async invokeSubagents(input: SubagentRunInput): Promise<SubagentRunOutput> {
    return runSubagents(
      input,
      {
        invoke: async (subInput) =>
          this.invoke({
            prompt: subInput.prompt,
            threadId: subInput.threadId,
            provider: subInput.provider,
            model: subInput.model,
            metadata: subInput.metadata,
            enabledSkills: subInput.enabledSkills,
            runId: subInput.runId,
            toolAllowlist: subInput.toolAllowlist
          })
      },
      {
        defaultMaxConcurrency: this.options.subagent?.maxConcurrency ?? 2,
        defaultTaskTimeoutMs: this.options.subagent?.taskTimeoutMs ?? 60_000,
        maxTasksPerRun: this.options.subagent?.maxTasksPerRun ?? 8,
        failurePolicy: this.options.subagent?.failurePolicy ?? "continue_on_error",
        roleModelOverrides: this.options.subagent?.roleModelOverrides,
        roleToolAllowlist: this.options.subagent?.roleToolAllowlist
      }
    );
  }

  invokeEventStream(input: AgentInvokeInput): AgentEventStream<AgentInvokeOutput> {
    const stream = createAgentEventStream<AgentInvokeOutput>();
    const runId = input.runId ?? `${input.threadId}-${Date.now()}`;

    void (async () => {
      stream.push({
        type: "run_start",
        runId,
        threadId: input.threadId,
        at: new Date().toISOString()
      });

      try {
        const routed = this.providerRegistry.createRoutedModel({
          provider: input.provider ?? this.options.defaultProvider,
          model: input.model ?? this.options.defaultModel,
          env: this.options.env,
          providerConfigs: { ...this.options.providerConfigs, ...input.providerConfigs }
        });

        stream.push({
          type: "model_selected",
          provider: routed.provider,
          model: routed.model,
          baseUrl: routed.baseUrl,
          temperature: routed.temperature,
          at: new Date().toISOString()
        });

        const tools = await this.registry.buildTools({
          threadId: input.threadId,
          runId: input.runId,
          metadata: input.metadata,
          enabledSkills: input.enabledSkills,
          memoryStore: this.options.memoryStore,
          skillRegistry: this.skillRegistry,
          executionPolicy: this.options.toolExecutionPolicy,
          mcpServices: this.options.mcpServices,
          toolAllowlist: input.toolAllowlist,
          onToolEvent: (event) => {
            stream.push({ ...event, at: new Date().toISOString() });
          }
        });

        stream.push({
          type: "tools_resolved",
          toolNames: tools.map((item) => item.name),
          count: tools.length,
          at: new Date().toISOString()
        });

        const promptSections = [
          this.options.systemPrompt ??
            process.env.AGENT_SYSTEM_PROMPT ??
            "You are a pragmatic software engineering agent. Use tools when needed and keep answers concrete."
        ];

        if (this.options.memoryStore) {
          const memoryContext = await this.options.memoryStore.renderPromptContext(input.threadId, { limit: 20 });
          if (memoryContext) promptSections.push(memoryContext);
        }

        const skillContext = this.skillRegistry.renderPromptContext({ enabledNames: input.enabledSkills });
        if (skillContext) promptSections.push(skillContext);

        const graph = createReactAgent({
          llm: routed.chatModel,
          tools,
          prompt: promptSections.join("\n\n"),
          checkpointer: this.options.checkpointSaver,
          name: "intelligent-agent-core"
        });

        // 流式执行：用 streamMode="messages" 获取 token 级输出
        let fullOutput = "";
        const streamInput = {
          messages: [...(input.messages ?? []), new HumanMessage(input.prompt)]
        };
        const streamConfig = {
          configurable: {
            thread_id: input.threadId,
            run_id: input.runId ?? input.threadId
          },
          streamMode: ["messages"] as StreamMode[],
          version: "v2"
        };

        try {
          const eventStream = graph.streamEvents(
            streamInput,
            streamConfig as any
          );

          for await (const event of eventStream) {
            if (event.event !== "on_chat_model_stream") continue;
            const chunk = event.data?.chunk;
            if (!chunk) continue;

            // 抽取 reasoning / thinking 内容（DeepSeek-R1 等推理模型）
            const reasoningContent = (chunk?.additional_kwargs?.reasoning_content ??
              chunk?.additional_kwargs?.thinking) as string | undefined;
            if (reasoningContent) {
              stream.push({
                type: "reasoning_delta",
                runId,
                threadId: input.threadId,
                text: reasoningContent,
                at: new Date().toISOString()
              });
            }

            // 抽取普通文本 token
            if (chunk.content) {
              const token =
                typeof chunk.content === "string"
                  ? chunk.content
                  : "";
              if (token) {
                fullOutput += token;
                stream.push({
                  type: "text_delta",
                  runId,
                  threadId: input.threadId,
                  text: token,
                  at: new Date().toISOString()
                });
              }
            }
          }
        } catch {
          // streamEvents error ignored, fallback below
        }

        if (!fullOutput) {
          const state = await graph.invoke(streamInput, {
            configurable: {
              thread_id: input.threadId,
              run_id: input.runId ?? input.threadId
            }
          });
          const messages = state.messages as BaseMessage[];
          fullOutput = extractLastAssistantText(messages);
        }

        const finalOutput = fullOutput || "";

        // 获取 checkpointId
        let checkpointId: string | null = null;
        if (this.options.checkpointSaver) {
          try {
            checkpointId = await getLatestCheckpointId(this.options.checkpointSaver, input.threadId);
          } catch {
            // ignore
          }
        }

        const finalResult: AgentInvokeOutput = {
          output: finalOutput,
          provider: routed.provider,
          messages: [],
          toolCount: tools.length,
          checkpointId,
          threadId: input.threadId
        };

        stream.complete(finalResult, {
          type: "run_end",
          runId,
          threadId: finalResult.threadId,
          provider: finalResult.provider,
          output: finalResult.output,
          checkpointId: finalResult.checkpointId ?? null,
          toolCount: finalResult.toolCount,
          at: new Date().toISOString()
        });
      } catch (error) {
        stream.fail(error, {
          type: "error",
          runId,
          threadId: input.threadId,
          message: error instanceof Error ? error.message : String(error),
          at: new Date().toISOString()
        });
      }
    })();

    return stream;
  }

  async *invokeStream(input: AgentInvokeInput): AsyncGenerator<AgentRunEvent, AgentInvokeOutput, void> {
    const stream = this.invokeEventStream(input);
    for await (const event of stream) {
      yield event;
    }
    return stream.result();
  }

  invokeSubagentsEventStream(input: SubagentRunInput): AgentEventStream<SubagentRunOutput> {
    const stream = createAgentEventStream<SubagentRunOutput>();
    const runId = input.runId ?? `subrun-${Date.now()}`;
    const startedAt = new Date().toISOString();

    void (async () => {
      stream.push({
        type: "run_start",
        runId,
        threadId: input.threadId,
        at: startedAt
      });

      try {
        const finalResult = await runSubagents(
          { ...input, runId },
          {
            invoke: async (subInput) =>
              this.invoke({
                prompt: subInput.prompt,
                threadId: subInput.threadId,
                provider: subInput.provider,
                model: subInput.model,
                metadata: subInput.metadata,
                enabledSkills: subInput.enabledSkills,
                runId: subInput.runId,
                toolAllowlist: subInput.toolAllowlist
              })
          },
          {
            defaultMaxConcurrency: this.options.subagent?.maxConcurrency ?? 2,
            defaultTaskTimeoutMs: this.options.subagent?.taskTimeoutMs ?? 60_000,
            maxTasksPerRun: this.options.subagent?.maxTasksPerRun ?? 8,
            failurePolicy: this.options.subagent?.failurePolicy ?? "continue_on_error",
            roleModelOverrides: this.options.subagent?.roleModelOverrides,
            roleToolAllowlist: this.options.subagent?.roleToolAllowlist
          },
          async (event) => {
            stream.push(event);
          }
        );

        stream.complete(finalResult, {
          type: "run_end",
          runId,
          threadId: input.threadId,
          provider: input.provider ?? this.options.defaultProvider ?? "qwen",
          output: finalResult.summary,
          checkpointId: null,
          toolCount: finalResult.results.length,
          at: new Date().toISOString()
        });
      } catch (error) {
        stream.fail(error, {
          type: "error",
          runId,
          threadId: input.threadId,
          message: error instanceof Error ? error.message : String(error),
          at: new Date().toISOString()
        });
      }
    })();

    return stream;
  }

  async *invokeSubagentsStream(input: SubagentRunInput): AsyncGenerator<AgentRunEvent, SubagentRunOutput, void> {
    const stream = this.invokeSubagentsEventStream(input);
    for await (const event of stream) {
      yield event;
    }
    return stream.result();
  }

  async listThreads(limit = 20) {
    if (!this.options.checkpointSaver) return [];
    return listThreads(this.options.checkpointSaver, limit);
  }

  async getThread(threadId: string) {
    if (!this.options.checkpointSaver) {
      return { thread_id: threadId, checkpoints: [] };
    }
    return getThread(this.options.checkpointSaver, threadId);
  }

  listSkills(options: { enabledOnly?: boolean; enabledNames?: string[] } = {}) {
    return this.skillRegistry.listSkills(options);
  }

  getSkill(name: string) {
    return this.skillRegistry.getSkill(name);
  }

  async listMemoryFacts(threadId: string, limit = 100) {
    return this.options.memoryStore?.listFacts(threadId, { limit }) ?? [];
  }

  async createMemoryFact(
    threadId: string,
    input: { content: string; category?: string; confidence?: number; metadata?: Record<string, unknown> }
  ) {
    if (!this.options.memoryStore) throw new Error("Memory store is not configured.");
    return this.options.memoryStore.createFact(threadId, input);
  }

  async deleteMemoryFact(threadId: string, factId: string) {
    if (!this.options.memoryStore) throw new Error("Memory store is not configured.");
    return this.options.memoryStore.deleteFact(threadId, factId);
  }

  listMcpPlugins(): McpPluginInfo[] {
    return this.registry.listMcpPlugins?.() ?? [];
  }

  async listMcpTools(input: { threadId?: string; runId?: string; metadata?: Record<string, unknown> } = {}): Promise<McpToolInfo[]> {
    const loaded =
      (await this.registry.buildMcpTools?.({
        invocationContext: {
          threadId: input.threadId,
          runId: input.runId,
          metadata: input.metadata
        },
        services: this.options.mcpServices
      })) ?? [];

    const uniqueByName = new Map<string, McpToolInfo>();
    for (const item of loaded) {
      if (!uniqueByName.has(item.tool.name)) {
        uniqueByName.set(item.tool.name, {
          plugin: item.plugin,
          name: item.tool.name,
          description: item.tool.description ?? ""
        });
      }
    }
    return [...uniqueByName.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  async invokeMcpTool(input: {
    toolName: string;
    arguments?: unknown;
    threadId?: string;
    runId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<{ plugin: string; toolName: string; output: unknown }> {
    const loaded =
      (await this.registry.buildMcpTools?.({
        invocationContext: {
          threadId: input.threadId,
          runId: input.runId,
          metadata: input.metadata
        },
        services: this.options.mcpServices
      })) ?? [];

    const match = loaded.find((item) => item.tool.name === input.toolName);
    if (!match) throw new Error(`MCP tool not found: ${input.toolName}`);

    const output = await match.tool.invoke(input.arguments ?? {});
    return {
      plugin: match.plugin,
      toolName: match.tool.name,
      output
    };
  }
}
