import { describe, it, expect } from "vitest";
import { z } from "zod";
import { StaticMcpToolPlugin } from "../ts/mcp";
import { ProviderRegistry, resolveProviderApiKey } from "../ts/provider-router";
import { DefaultAgentToolRegistry, registerBuiltinTools } from "../ts/tools";

describe("DefaultAgentToolRegistry", () => {
  it("builds builtin tools", async () => {
    const registry = registerBuiltinTools(new DefaultAgentToolRegistry());
    const tools = await registry.buildTools();
    expect(tools.length).toBeGreaterThan(0);
    expect(tools.some((t) => t.name === "get_time")).toBe(true);
  });

  it("enforces sequential execution policy for local tools", async () => {
    const registry = new DefaultAgentToolRegistry();
    const events: string[] = [];
    let concurrent = 0;
    let maxConcurrent = 0;

    registry.registerLocalTool({
      name: "slow_local",
      description: "slow local test tool",
      schema: z.object({ value: z.number() }),
      executionMode: "sequential",
      invoke: async (input) => {
        concurrent += 1;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        await new Promise((resolve) => setTimeout(resolve, 10));
        concurrent -= 1;
        return { value: input.value };
      }
    });

    const tools = await registry.buildTools({
      executionPolicy: { mode: "parallel" },
      onToolEvent: (event) => events.push(event.type)
    });
    const slowTool = tools.find((toolDef) => toolDef.name === "slow_local");
    expect(slowTool).toBeDefined();

    await Promise.all([
      slowTool!.invoke({ value: 1 }),
      slowTool!.invoke({ value: 2 })
    ]);

    expect(maxConcurrent).toBe(1);
    expect(events.filter((event) => event === "tool_start").length).toBe(2);
    expect(events.filter((event) => event === "tool_end").length).toBe(2);
  });

  it("injects invocation context and services into MCP tools", async () => {
    const registry = new DefaultAgentToolRegistry();
    registry.useMcpPlugin(
      new StaticMcpToolPlugin("mcp-demo", [
        {
          name: "mcp_echo_ctx",
          description: "echo mcp context",
          schema: z.object({ text: z.string() }),
          invoke: async (input, context) => ({
            text: input.text,
            threadId: context.threadId,
            runId: context.runId,
            metadata: context.metadata,
            serviceKeys: Object.keys(context.services ?? {})
          })
        }
      ])
    );

    const tools = await registry.buildTools({
      threadId: "thread-ctx",
      runId: "run-ctx",
      metadata: { user_id: "u1" },
      mcpServices: { pgPool: { mock: true }, redis: { mock: true } }
    });
    const mcpTool = tools.find((toolDef) => toolDef.name === "mcp_echo_ctx");
    expect(mcpTool).toBeDefined();

    const raw = await mcpTool!.invoke({ text: "hello" });
    const parsed = JSON.parse(String(raw)) as {
      text: string;
      threadId?: string;
      runId?: string;
      metadata?: Record<string, unknown>;
      serviceKeys?: string[];
    };

    expect(parsed.text).toBe("hello");
    expect(parsed.threadId).toBe("thread-ctx");
    expect(parsed.runId).toBe("run-ctx");
    expect(parsed.metadata?.user_id).toBe("u1");
    expect(parsed.serviceKeys?.sort()).toEqual(["pgPool", "redis"]);
  });
});

describe("ProviderRegistry", () => {
  it("supports provider aliases and dynamic registration", () => {
    const registry = new ProviderRegistry({
      qwen: {
        apiKeyEnv: "QWEN_API_KEY",
        baseUrlEnv: "QWEN_BASE_URL",
        modelEnv: "QWEN_MODEL",
        defaultBaseUrl: "https://example.com",
        defaultModel: "qwen-plus",
        aliases: ["tongyi"]
      }
    });

    registry.registerProvider("custom", {
      apiKeyEnv: "CUSTOM_KEY",
      baseUrlEnv: "CUSTOM_BASE_URL",
      modelEnv: "CUSTOM_MODEL",
      defaultBaseUrl: "https://custom.example.com",
      defaultModel: "custom-model",
      aliases: ["corp"]
    });

    expect(registry.normalizeProvider("corp")).toBe("custom");
    expect(registry.normalizeProvider("tongyi")).toBe("qwen");
    expect(registry.listProviders().some((item) => item.name === "custom")).toBe(true);
  });

  it("supports anthropic aliases and auth token fallback", () => {
    const registry = new ProviderRegistry();
    expect(registry.normalizeProvider("claude")).toBe("anthropic");

    const routed = registry.createRoutedModel({
      provider: "anthropic",
      env: {
        ANTHROPIC_AUTH_TOKEN: "fallback-token",
        ANTHROPIC_BASE_URL: "https://token-plan-cn.xiaomimimo.com/anthropic",
        ANTHROPIC_MODEL: "mimo-v2.5-pro"
      }
    });

    expect(routed.provider).toBe("anthropic");
    expect(routed.model).toBe("mimo-v2.5-pro");
    expect(routed.baseUrl).toBe("https://token-plan-cn.xiaomimimo.com/anthropic");
  });

  it("prefers primary anthropic api key over auth token alias", () => {
    const registry = new ProviderRegistry();
    const config = registry.getConfig("anthropic");
    expect(config).toBeTruthy();

    const apiKey = resolveProviderApiKey(config!, {
      ANTHROPIC_API_KEY: "primary-token",
      ANTHROPIC_AUTH_TOKEN: "fallback-token"
    });

    expect(apiKey).toBe("primary-token");
  });

  it("keeps deepseek on the openai-compatible route", () => {
    const registry = new ProviderRegistry();
    const routed = registry.createRoutedModel({
      provider: "deepseek",
      env: {
        DEEPSEEK_API_KEY: "deepseek-token",
        DEEPSEEK_BASE_URL: "https://api.deepseek.com/v1",
        DEEPSEEK_MODEL: "deepseek-v4-flash"
      }
    });

    expect(routed.provider).toBe("deepseek");
    expect(routed.model).toBe("deepseek-v4-flash");
    expect(routed.baseUrl).toBe("https://api.deepseek.com/v1");
  });
});
