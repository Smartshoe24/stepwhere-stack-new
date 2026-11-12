import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@stepwhere/types": fileURLToPath(new URL("../../packages/types/src/index.ts", import.meta.url)),
    },
  },
  define: { __AGENT_VERSION__: JSON.stringify("0.0.0-test") },
  test: { include: ["test/**/*.test.ts"] },
});
