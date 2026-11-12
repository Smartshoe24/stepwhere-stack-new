import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type Plugin } from "vite";

function associationFilesPlugin(env: Record<string, string>): Plugin {
  return {
    name: "stepwhere-association-files",
    generateBundle() {
      const appleTeamId = env.APPLE_TEAM_ID?.trim();
      const androidFingerprints = env.ANDROID_CERT_SHA256_FINGERPRINTS
        ?.split(",")
        .map((value) => value.trim())
        .filter(Boolean);

      if (appleTeamId) {
        this.emitFile({
          type: "asset",
          fileName: ".well-known/apple-app-site-association",
          source: JSON.stringify({
            applinks: {
              details: [
                {
                  appIDs: [`${appleTeamId}.com.stepwhere`],
                  components: [{ "/": "/family/join" }],
                },
              ],
            },
          }),
        });
      }

      if (androidFingerprints?.length) {
        this.emitFile({
          type: "asset",
          fileName: ".well-known/assetlinks.json",
          source: JSON.stringify([
            {
              relation: ["delegate_permission/common.handle_all_urls"],
              target: {
                namespace: "android_app",
                package_name: "com.stepwhere",
                sha256_cert_fingerprints: androidFingerprints,
              },
            },
          ]),
        });
      }
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const proxyTarget = env.VITE_API_URL || "http://api.stepwhere.local";
  // Public tunnel hosts from the local dev stack (pnpm dev:public).
  const allowedHosts = (env.STEPWHERE_DEV_ALLOWED_HOSTS ?? "")
    .split(",")
    .map((host) => host.trim())
    .filter(Boolean);

  return {
    plugins: [react(), associationFilesPlugin(env)],
    server: {
      host: "127.0.0.1",
      port: 5175,
      allowedHosts,
      proxy: {
        "/__share_api": {
          target: proxyTarget,
          changeOrigin: true,
          ws: true,
          rewrite: (path) => path.replace(/^\/__share_api/, ""),
        },
      },
    },
    preview: {
      host: "127.0.0.1",
      port: 4175,
    },
  };
});
