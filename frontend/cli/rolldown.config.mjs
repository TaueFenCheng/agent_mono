import { builtinModules } from "node:module";
import { defineConfig } from "rolldown";

const nodeBuiltins = new Set([...builtinModules, ...builtinModules.map((m) => `node:${m}`)]);

export default defineConfig({
  input: "src/index.tsx",
  external: (id) => {
    if (nodeBuiltins.has(id)) return true;
    if (id.startsWith("@intelligent-agent/")) return true;
    if (id === "ink" || id === "ink-text-input") return true;
    if (id === "react" || id.startsWith("react/")) return true;
    return false;
  },
  output: {
    file: "dist/index.js",
    format: "esm",
    sourcemap: true
  }
});
