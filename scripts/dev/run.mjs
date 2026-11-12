#!/usr/bin/env node
// Usage: node scripts/dev/run.mjs <app> -- <command...>
//
// Builds the environment for one dev process and runs it:
//   Infisical secrets (when the app has a project and access works)
//   → local stand-ins for required secrets Infisical didn't provide
//   → the local stack overlay from env.mjs (URLs, ports, local DB), which always wins
//
// Fetching secrets here instead of wrapping with `infisical run` keeps the
// overlay last; `infisical run` would override the shell.

import { spawn } from "node:child_process";

import {
  INFISICAL_PROJECTS,
  appEnvironment,
  devConfig,
  fetchInfisicalSecrets,
  localSecrets,
  settings,
} from "./env.mjs";

const [app, separator, ...command] = process.argv.slice(2);
if (!app || separator !== "--" || command.length === 0) {
  console.error("usage: node scripts/dev/run.mjs <app> -- <command...>");
  process.exit(64);
}

const source = settings();
const config = devConfig(source);

function infisicalSecrets(projectId) {
  const result = fetchInfisicalSecrets(projectId, source);
  if (!result.ok) {
    console.warn(`[dev] Infisical unavailable for ${app} (${result.auth}); using local dev defaults.${result.reason ? ` (${result.reason})` : ""}`);
  }
  return result.secrets;
}

const projectId = INFISICAL_PROJECTS[app];
const secrets = projectId && config.useInfisical ? infisicalSecrets(projectId) : {};

// Tunnel tokens and Infisical credentials stay out of the apps.
const inherited = Object.fromEntries(
  Object.entries(source).filter(([key]) => !key.startsWith("PINGGY_") && !key.startsWith("INFISICAL_")),
);

const env = {
  ...inherited,
  ...localSecrets(app),
  ...secrets,
  ...appEnvironment(app, config),
  FORCE_COLOR: source.FORCE_COLOR ?? "1",
};
if (projectId && Object.keys(secrets).length > 0) {
  console.log(`[dev] ${app}: ${Object.keys(secrets).length} secrets from Infisical, local stack overrides applied.`);
}

const child = spawn(command[0], command.slice(1), { cwd: process.cwd(), env, stdio: "inherit" });

let stopping = false;
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(signal, () => {
    stopping = true;
    child.kill(signal);
    // Don't hang shutdown if the child ignores the first signal.
    setTimeout(() => child.kill("SIGKILL"), 8_000).unref();
  });
}

child.on("exit", (code, signal) => {
  if (signal && !stopping) process.kill(process.pid, signal);
  process.exit(code ?? (signal ? 1 : 0));
});
child.on("error", (error) => {
  console.error(`[dev] could not start ${command[0]}: ${error.message}`);
  process.exit(127);
});
