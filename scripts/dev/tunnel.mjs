#!/usr/bin/env node
// Usage: node scripts/dev/tunnel.mjs <panel|share>
//
// One Pinggy Pro tunnel → the local Caddy edge (dev/Caddyfile, port 8800).
// Caddy routes by Host, so every tunnel points at the same port.
//
// Tokens and hosts (see scripts/dev/env.mjs for where they're read from):
//   panel: PINGGY_TOKEN / PINGGY_DOMAIN in apps/dev-tunnel/.env.local (the
//          existing setup), or PINGGY_PANEL_TOKEN / STEPWHERE_PANEL_HOST
//   share: PINGGY_SHARE_TOKEN / STEPWHERE_SHARE_HOST
// Each Pinggy Pro token carries its persistent domain.
//
// Plain HTTP must stay enabled on the panel tunnel (no "force HTTPS"): the
// firmware posts to http://<panel host>/v1/telemetry/location.

import { spawn } from "node:child_process";

import { PORTS, devConfig, pinggyBinary, settings } from "./env.mjs";

const name = process.argv[2];
const source = settings();
const config = devConfig(source);

const tunnels = {
  panel: { token: source.PINGGY_PANEL_TOKEN, host: config.panelHost },
  share: { token: source.PINGGY_SHARE_TOKEN, host: config.shareHost },
};
const tunnel = tunnels[name];

if (!tunnel) {
  console.error("usage: node scripts/dev/tunnel.mjs <panel|share>");
  process.exit(64);
}
if (!tunnel.token || !tunnel.host) {
  const where =
    name === "panel"
      ? "PINGGY_TOKEN in apps/dev-tunnel/.env.local (or PINGGY_PANEL_TOKEN in dev/local.env)"
      : `PINGGY_SHARE_TOKEN${tunnel.host ? "" : " and STEPWHERE_SHARE_HOST"} in dev/local.env`;
  console.log(`[tunnel:${name}] skipped: set ${where}.`);
  process.exit(0);
}

// The Pinggy CLI takes the same arguments as ssh and reconnects on its own.
const binary = pinggyBinary(source);
const sshOnly = binary
  ? []
  : ["-o", "UserKnownHostsFile=/dev/null", "-o", "LogLevel=ERROR", "-o", "ServerAliveCountMax=3", "-o", "ExitOnForwardFailure=yes"];
console.log(`[tunnel:${name}] https://${tunnel.host} → 127.0.0.1:${PORTS.edge} (${binary ?? "ssh"})`);

const child = spawn(
  binary ?? "ssh",
  [
    "-p", "443",
    "-R", `0:127.0.0.1:${PORTS.edge}`,
    "-o", "StrictHostKeyChecking=no",
    "-o", "ServerAliveInterval=30",
    ...sshOnly,
    `${tunnel.token}@pro.pinggy.io`,
  ],
  { stdio: ["ignore", "inherit", "inherit"] },
);

// Report once the stack answers through the tunnel. The firmware needs a direct
// 200 over plain HTTP, so redirects count as failures.
const healthUrl = name === "panel" ? `http://${tunnel.host}/health` : `https://${tunnel.host}/__share_api/health`;
let lastStatus = "";
const health = setInterval(async () => {
  let status;
  try {
    const response = await fetch(healthUrl, { redirect: "manual", signal: AbortSignal.timeout(10_000) });
    status = `HTTP ${response.status}`;
  } catch {
    status = "unreachable";
  }
  if (status !== lastStatus) {
    console.log(`[tunnel:${name}] ${healthUrl} → ${status}`);
    lastStatus = status;
  }
}, 5_000);

function stop(signal) {
  clearInterval(health);
  // SIGTERM makes the CLI close the tunnel on Pinggy's side before exiting.
  child.kill(signal);
  setTimeout(() => child.kill("SIGKILL"), 5_000).unref();
}
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(signal, () => stop(signal));

// A dropped tunnel exits non-zero so process-compose restarts it.
child.on("exit", (code, signal) => {
  clearInterval(health);
  process.exit(code ?? (signal ? 1 : 0));
});
