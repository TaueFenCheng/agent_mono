import { ChatAnthropic } from "@langchain/anthropic";
import { ChatOpenAI } from "@langchain/openai";
import type { CreateRoutedModelInput, ProviderRouteConfig, ProviderRuntimeConfig, RoutedModelResult } from "./types.js";

function buildDefaultProviderConfigs(): Record<string, ProviderRouteConfig> {
  return {
    qwen: {
      apiKeyEnv: "QWEN_API_KEY",
      baseUrlEnv: "QWEN_BASE_URL",
      modelEnv: "QWEN_MODEL",
      defaultBaseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      defaultModel: "qwen-plus",
      aliases: ["tongyi"]
    },
    glm: {
      apiKeyEnv: "GLM_API_KEY",
      baseUrlEnv: "GLM_BASE_URL",
      modelEnv: "GLM_MODEL",
      defaultBaseUrl: "https://open.bigmodel.cn/api/paas/v4",
      defaultModel: "glm-4.5",
      aliases: ["zhipu", "chatglm"]
    },
    deepseek: {
      apiKeyEnv: "DEEPSEEK_API_KEY",
      baseUrlEnv: "DEEPSEEK_BASE_URL",
      modelEnv: "DEEPSEEK_MODEL",
      defaultBaseUrl: "https://api.deepseek.com/v1",
      defaultModel: "deepseek-chat",
      aliases: ["ds"]
    },
    anthropic: {
      apiKeyEnv: "ANTHROPIC_API_KEY",
      apiKeyEnvAliases: ["ANTHROPIC_AUTH_TOKEN"],
      baseUrlEnv: "ANTHROPIC_BASE_URL",
      modelEnv: "ANTHROPIC_MODEL",
      defaultBaseUrl: "https://api.anthropic.com",
      defaultModel: "claude-3-5-haiku-latest",
      aliases: ["claude"]
    },
    openai: {
      apiKeyEnv: "OPENAI_API_KEY",
      baseUrlEnv: "OPENAI_BASE_URL",
      modelEnv: "OPENAI_MODEL",
      defaultBaseUrl: "https://api.openai.com/v1",
      defaultModel: "gpt-4.1-mini"
    }
  };
}

export function resolveProviderApiKey(
  config: ProviderRouteConfig,
  env: Record<string, string | undefined>,
  providerConfig: ProviderRuntimeConfig = {}
): string | undefined {
  if (providerConfig.apiKey) return providerConfig.apiKey;
  const primary = env[config.apiKeyEnv];
  if (primary) return primary;
  for (const alias of config.apiKeyEnvAliases ?? []) {
    const value = env[alias];
    if (value) return value;
  }
  return undefined;
}

export class ProviderRegistry {
  private readonly providers = new Map<string, ProviderRouteConfig>();
  private readonly aliases = new Map<string, string>();

  constructor(initialConfigs?: Record<string, ProviderRouteConfig>) {
    for (const [name, config] of Object.entries(initialConfigs ?? buildDefaultProviderConfigs())) {
      this.registerProvider(name, config);
    }
  }

  registerProvider(name: string, config: ProviderRouteConfig): void {
    const normalized = name.trim().toLowerCase();
    if (!normalized) throw new Error("Provider name cannot be empty.");
    this.providers.set(normalized, { ...config });
    this.aliases.set(normalized, normalized);
    for (const alias of config.aliases ?? []) {
      this.aliases.set(alias.trim().toLowerCase(), normalized);
    }
  }

  unregisterProvider(name: string): void {
    const normalized = name.trim().toLowerCase();
    this.providers.delete(normalized);
    for (const [alias, providerName] of [...this.aliases.entries()]) {
      if (providerName === normalized || alias === normalized) {
        this.aliases.delete(alias);
      }
    }
  }

  listProviders(): Array<{ name: string; config: ProviderRouteConfig }> {
    return [...this.providers.entries()].map(([name, config]) => ({ name, config: { ...config } }));
  }

  normalizeProvider(provider?: string): string {
    const raw = (provider ?? process.env.AGENT_PROVIDER ?? "qwen").trim().toLowerCase();
    const resolved = this.aliases.get(raw);
    if (resolved) return resolved;
    if (this.providers.has(raw)) return raw;
    return "qwen";
  }

  getConfig(provider: string): ProviderRouteConfig | null {
    const normalized = this.normalizeProvider(provider);
    return this.providers.get(normalized) ?? null;
  }

  createRoutedModel(input: CreateRoutedModelInput): RoutedModelResult {
    const env = input.env ?? process.env;
    const provider = this.normalizeProvider(input.provider ?? env.AGENT_PROVIDER ?? "qwen");
    const config = this.providers.get(provider);
    if (!config) {
      throw new Error(`Provider is not registered: ${provider}`);
    }

    const providerConfig = input.providerConfig ?? input.providerConfigs?.[provider] ?? {};
    const apiKey = resolveProviderApiKey(config, env, providerConfig);
    if (!apiKey) {
      throw new Error(`Missing API key: ${config.apiKeyEnv}`);
    }

    const model = input.model ?? providerConfig.model ?? input.defaultModel ?? env[config.modelEnv] ?? config.defaultModel;
    const baseUrl = providerConfig.baseUrl ?? env[config.baseUrlEnv] ?? config.defaultBaseUrl;
    const temperatureEnv = config.temperatureEnv ?? "AGENT_TEMPERATURE";
    const temperature =
      input.temperature ??
      providerConfig.temperature ??
      Number(env[temperatureEnv] ?? String(config.defaultTemperature ?? 0.2));

    return {
      provider,
      model,
      baseUrl,
      temperature,
      chatModel:
        provider === "anthropic"
          ? new ChatAnthropic({
              model,
              anthropicApiKey: apiKey,
              clientOptions: { baseURL: baseUrl },
              temperature
            })
          : new ChatOpenAI({
              model,
              apiKey,
              configuration: { baseURL: baseUrl },
              temperature
            })
    };
  }
}

let sharedProviderRegistry: ProviderRegistry | null = null;

export function getProviderRegistry(): ProviderRegistry {
  if (!sharedProviderRegistry) {
    sharedProviderRegistry = new ProviderRegistry();
  }
  return sharedProviderRegistry;
}

export function normalizeProvider(provider?: string): string {
  return getProviderRegistry().normalizeProvider(provider);
}

export function createRoutedModel(input: CreateRoutedModelInput): RoutedModelResult {
  return getProviderRegistry().createRoutedModel(input);
}
