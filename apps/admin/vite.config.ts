/// <reference types="vitest/config" />
import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import { playwright } from "@vitest/browser-playwright";

// The local dev stack (pnpm dev) leaves VITE_STEPWHERE_API_URL empty so the
// admin calls its own origin; this proxy forwards the API like Caddy does in prod.
const devApiTarget = process.env.STEPWHERE_DEV_API_TARGET ?? "http://127.0.0.1:8223";
const devAllowedHosts = (process.env.STEPWHERE_DEV_ALLOWED_HOSTS ?? "")
  .split(",")
  .map((host) => host.trim())
  .filter(Boolean);

// https://vite.dev/config/
export default defineConfig({
  server: {
    allowedHosts: devAllowedHosts,
    proxy: {
      "/v1": { target: devApiTarget, ws: true },
      "/api/auth": { target: devApiTarget },
    },
  },
  plugins: [
    tanstackRouter({
      target: "react",
      autoCodeSplitting: true,
    }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    silent: "passed-only",
    unstubEnvs: true,
    browser: {
      enabled: true,
      provider: playwright(),
      instances: [{ browser: "chromium" }],
    },
    coverage: {
      // include: ['src/**/*.{js,jsx,ts,tsx}'], // Uncomment to expand the report to all src/**/* so untested modules appear as 0% coverage.
      exclude: [
        "src/components/ui/**",
        "src/assets/**",
        "src/tanstack-table.d.ts",
        "src/routeTree.gen.ts",
        "src/test-utils/**",
        "src/routes/**",
      ],
    },
  },
});
