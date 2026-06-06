import path from "node:path";
import { pathToFileURL } from "node:url";
import type { McpToolPlugin } from "./types.js";

function asPlugin(value: unknown): McpToolPlugin | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<McpToolPlugin>;
  if (typeof candidate.name !== "string") return null;
  if (typeof candidate.loadTools !== "function") return null;
  return candidate as McpToolPlugin;
}

async function importPlugin(specifier: string): Promise<McpToolPlugin | null> {
  const trimmed = specifier.trim();
  if (!trimmed) return null;

  const maybePath = trimmed.startsWith(".") || trimmed.startsWith("/") ? pathToFileURL(path.resolve(trimmed)).href : trimmed;
  const mod = await import(maybePath);

  const fromDefault = asPlugin(mod.default);
  if (fromDefault) return fromDefault;

  const fromNamed = asPlugin(mod.plugin);
  if (fromNamed) return fromNamed;

  return null;
}

export async function loadMcpPluginsFromEnv(envKey = "AGENT_MCP_PLUGIN_MODULES"): Promise<McpToolPlugin[]> {
  const raw = process.env[envKey];
  if (!raw) return [];

  const specs = raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  const loaded: McpToolPlugin[] = [];
  for (const spec of specs) {
    try {
      const plugin = await importPlugin(spec);
      if (plugin) loaded.push(plugin);
    } catch (error) {
      // Keep runtime resilient when optional plugin import fails.
      console.warn(`Failed to load MCP plugin '${spec}':`, error);
    }
  }

  return loaded;
}
