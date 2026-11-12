#!/usr/bin/env node
// Usage: node scripts/dev/doctor.mjs [--quick] [--public]
//
// --quick is the preflight `pnpm dev` runs: it only fails on things that would
// stop the stack (missing tools, Docker down, a port held by something else).

import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";

import { INFISICAL_PROJECTS, PORTS, ROOT, devConfig, fetchInfisicalSecrets, pinggyBinary, settings } from "./env.mjs";

const quick = process.argv.includes("--quick");
const wantPublic = process.argv.includes("--public");
const source = settings();
const config = devConfig({ ...source, ...(wantPublic ? { STEPWHERE_PUBLIC: "1" } : {}) });

mkdirSync(join(ROOT, ".dev", "logs"), { recursive: true });

const problems = [];
const warnings = [];
const ok = [];

function run(command, args, timeout = 15_000) {
  const result = spawnSync(command, args, { cwd: ROOT, encoding: "utf8", timeout });
  return { ok: !result.error && result.status === 0, out: `${result.stdout ?? ""}${result.stderr ?? ""}`.trim() };
}

function tool(command, args, hint, required = true) {
  const result = run(command, args);
  const version = result.out.split("\n").find((line) => /\d+\.\d+/.test(line))?.trim() ?? "";
  if (result.ok) ok.push(`${command} ${version}`.trim());
  else (required ? problems : warnings).push(`${command} not found. ${hint}`);
}

tool("process-compose", ["version"], "brew install f1bonacci/tap/process-compose");
tool("docker", ["--version"], "Install Docker Desktop.");
tool("pnpm", ["--version"], "corepack enable");
tool("infisical", ["--version"], "brew install infisical/get-cli/infisical (optional: local defaults are used without it).", false);
if (wantPublic) tool("ssh", ["-V"], "OpenSSH is needed for Pinggy tunnels.");

if (!run("docker", ["info", "--format", "{{.ServerVersion}}"]).ok) {
  problems.push("Docker is not running. Start Docker Desktop.");
}

function portFree(port) {
  return new Promise((resolve) => {
    const server = createServer()
      .once("error", () => resolve(false))
      .once("listening", () => server.close(() => resolve(true)))
      .listen(port, "127.0.0.1");
  });
}

// Postgres/Redis are Docker's; a held app port means a stray dev server.
const appPorts = { server: PORTS.server, admin: PORTS.admin, share: PORTS.share, ingest: PORTS.ingest };
if (wantPublic) appPorts.edge = PORTS.edge;
for (const [name, port] of Object.entries(appPorts)) {
  if (!(await portFree(port))) {
    const holder = run("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN"]).out.split("\n")[1]?.split(/\s+/).slice(0, 2).join(" pid ") ?? "unknown";
    problems.push(`Port ${port} (${name}) is in use by ${holder}. Stop it or run pnpm dev:down.`);
  }
}

if (!quick && config.useInfisical) {
  for (const [app, projectId] of Object.entries(INFISICAL_PROJECTS)) {
    const result = fetchInfisicalSecrets(projectId, source);
    if (result.ok) ok.push(`Infisical access for ${app} (${result.auth}, ${Object.keys(result.secrets).length} secrets)`);
    else {
      const fix = source.INFISICAL_TOKEN || source.INFISICAL_CLIENT_ID
        ? "Check the token or client credentials, and that the machine identity can read this project's dev environment"
        : "Set INFISICAL_TOKEN in .env (see dev/local.env.example), or run `infisical login` and pick the Stepwhere organization";
      warnings.push(`No Infisical access for ${app} via ${result.auth}${result.reason ? ` (${result.reason})` : ""}. ${fix}. Local dev defaults will be used.`);
    }
  }
}

if (wantPublic) {
  if (!source.PINGGY_PANEL_TOKEN) problems.push("No Pinggy token: set PINGGY_TOKEN in apps/dev-tunnel/.env.local (or PINGGY_PANEL_TOKEN in dev/local.env).");
  else ok.push("Pinggy panel token");
  const binary = pinggyBinary(source);
  ok.push(binary ? `Pinggy CLI ${binary}` : "Pinggy CLI not found; tunnels use ssh");
  if (!config.shareHost) warnings.push("STEPWHERE_SHARE_HOST is not set: share links will point at 127.0.0.1.");
  else if (!source.PINGGY_SHARE_TOKEN) warnings.push("PINGGY_SHARE_TOKEN is not set: the share tunnel will be skipped.");
  ok.push(`panel host ${config.panelHost}${config.shareHost ? `, share host ${config.shareHost}` : ""}`);
}

if (!quick) {
  for (const line of ok) console.log(`  ok    ${line}`);
}
for (const line of warnings) console.log(`  warn  ${line}`);
for (const line of problems) console.log(`  fail  ${line}`);
if (problems.length > 0) {
  console.log("\nFix the items above, then run the command again.");
  process.exit(1);
}
if (!quick) console.log("\nReady.");
