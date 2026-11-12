#!/usr/bin/env node
// Printed as the first tab in the process-compose TUI: where everything lives.

import { PORTS, devConfig } from "./env.mjs";

const config = devConfig();
const rows = [];
const row = (label, local, remote = "") => rows.push([label, local, remote]);

row("Admin", config.local.admin, config.public?.panel ?? "");
row("API", config.local.api, config.public ? `${config.public.panel}  (/v1, /api/auth)` : "");
row("Share view", config.local.share, config.public ? (config.public.share ?? "set STEPWHERE_SHARE_HOST") : "");
row("Ingest proxy", `${config.local.ingest}/location`);
row("Firmware", "", config.public ? `${config.public.firmwareIngest}  (plain HTTP)` : "");
row("Postgres", config.database);
row("Redis", `redis://127.0.0.1:${PORTS.redis}`);
row("Mobile API", `http://${config.lanAddress}:${PORTS.server}  (same Wi-Fi)`, config.public?.panel ?? "");

const width = Math.max(...rows.map(([, local]) => local.length), 10);
const lines = [
  `Stepwhere dev stack · ${config.isPublic ? "public (Pinggy)" : "local"}`,
  "",
  ...rows.map(([label, local, remote]) => `  ${label.padEnd(13)} ${local.padEnd(width)}  ${remote}`.trimEnd()),
  "",
  "QA bench agent",
  config.public
    ? `  npm install -g ${config.public.agentDownload}`
    : "  pnpm --filter @stepwhere/qa-agent build && node apps/qa-agent/dist/cli.js",
  `  stepwhere-qa-agent pair --server ${config.apiPublic} --code XXXX-XXXX   (code from Admin → QA → Bench)`,
  "",
  "Commands",
  "  pnpm dev:logs server      follow one process        pnpm dev:restart admin",
  "  pnpm dev:down             stop apps (Postgres and Redis keep running; pnpm infra:down stops them)",
  "",
  "Sign-in codes print in the server log while Twilio isn't configured.",
];

console.log(lines.join("\n"));
