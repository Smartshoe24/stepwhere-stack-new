// Bundles src/cli.ts into a single dist/cli.js. `serialport` is native and stays external,
// so it is installed next to the bundle as a regular dependency.
import { build } from "esbuild";
import { readFileSync, chmodSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));

rmSync(resolve(root, "dist"), { recursive: true, force: true });

await build({
  entryPoints: [resolve(root, "src/cli.ts")],
  outfile: resolve(root, "dist/cli.js"),
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  external: ["serialport"],
  // The shared types package points "node" at a compiled dist that may be stale; use the source.
  alias: { "@stepwhere/types": resolve(root, "../../packages/types/src/index.ts") },
  define: { __AGENT_VERSION__: JSON.stringify(pkg.version) },
  banner: {
    js: [
      "#!/usr/bin/env node",
      "import { createRequire as __cr } from 'module';",
      "const require = __cr(import.meta.url);",
    ].join("\n"),
  },
  logLevel: "info",
});

chmodSync(resolve(root, "dist/cli.js"), 0o755);
