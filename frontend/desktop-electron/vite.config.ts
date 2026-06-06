import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@tang-agent/ui": path.resolve(__dirname, "../../packages/ui/src/index.ts")
    }
  },
  server: {
    port: 1421,
    strictPort: true
  }
});
