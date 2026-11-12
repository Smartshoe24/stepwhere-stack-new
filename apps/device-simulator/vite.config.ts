import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const proxyTarget = env.VITE_API_URL || "http://api.stepwhere.local";
  const ingestProxyTarget =
    env.VITE_DEVICE_INGEST_PROXY_URL || "http://ingest.stepwhere.in";

  return {
    plugins: [react()],
    server: {
      host: "127.0.0.1",
      port: 5174,
      proxy: {
        "/__device_simulator_ingest": {
          target: ingestProxyTarget,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/__device_simulator_ingest/, ""),
        },
        "/__device_simulator_api": {
          target: proxyTarget,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/__device_simulator_api/, ""),
        },
      },
    },
    preview: {
      host: "127.0.0.1",
      port: 4174,
    },
  };
});
