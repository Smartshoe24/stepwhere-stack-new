// The one place that knows the local dev stack's ports and URLs.
//
// Every process in process-compose.yaml starts through scripts/dev/run.mjs,
// which asks this module for that app's environment. Public mode (pnpm
// dev:public) swaps browser-facing URLs for the Pinggy hosts; server-to-server
// traffic always stays on 127.0.0.1 so nothing depends on the tunnel.
//
// Settings come from, in order: the shell, dev/local.env (gitignored), then the
// defaults below. See docs/dev-stack.md.

import { spawnSync } from "node:child_process";
import { accessSync, constants, existsSync, readFileSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

export const PORTS = {
  server: 8223,
  admin: 4800,
  share: 5175,
  simulator: 5174,
  ingest: 8290,
  metro: 8081,
  edge: 8800,
  postgres: 5433,
  redis: 6380,
};

/** The firmware posts to this host today; it doubles as the public panel + API host. */
const DEFAULT_PANEL_HOST = "npafhgmeij.a.pinggy.link";

/** Infisical projects per app. Missing access falls back to LOCAL_SECRETS. */
export const INFISICAL_PROJECTS = {
  server: "c54a008b-1814-4bfe-bafa-564b6f330113",
  share: "800069dc-a7e4-4c31-a461-01bb866e8d91",
};

/**
 * Stand-ins for secrets the server refuses to boot without. Only used when
 * Infisical did not provide a value, and only ever for the local stack.
 */
const LOCAL_SECRETS = {
  server: {
    BETTER_AUTH_SECRET: "stepwhere-local-dev-auth-secret-not-for-production",
    SHARE_LINK_SIGNING_SECRET: "stepwhere-local-dev-share-signing-secret-0000",
    DEVICE_PROVISIONING_SECRET: "stepwhere-local-dev-provisioning",
    AWS_ACCESS_KEY_ID: "local-dev",
    AWS_SECRET_ACCESS_KEY: "local-dev",
    AWS_S3_AVATARS_BUCKET: "stepwhere-local-dev-avatars",
  },
};

export function readDotenv(file) {
  if (!existsSync(file)) return {};
  const values = {};
  for (const raw of readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    let value = match[2].trim();
    if (/^(['"]).*\1$/.test(value)) value = value.slice(1, -1);
    values[match[1]] = value;
  }
  return values;
}

/**
 * The main checkout, when this is a linked worktree. Gitignored setup (Pinggy
 * token, local.env) lives there once and every worktree reuses it.
 */
export function mainCheckoutRoot() {
  const result = spawnSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  const commonDir = result.status === 0 ? result.stdout.trim() : "";
  const main = commonDir.endsWith("/.git") ? dirname(commonDir) : null;
  return main && main !== ROOT ? main : null;
}

/** Checkouts to read gitignored setup from: the main checkout first, this one last (it wins). */
function setupRoots() {
  const main = mainCheckoutRoot();
  return main ? [main, ROOT] : [ROOT];
}

/**
 * Shell > dev/local.env > apps/dev-tunnel/.env.local > root .env, each read from
 * the main checkout and then this checkout.
 *
 * apps/dev-tunnel/.env.local is the existing tunnel setup (PINGGY_TOKEN,
 * PINGGY_DOMAIN); its names map onto the panel tunnel.
 */
export function settings() {
  const files = [".env", "apps/dev-tunnel/.env.local", "dev/local.env"];
  const fromFiles = {};
  for (const file of files) {
    for (const root of setupRoots()) Object.assign(fromFiles, readDotenv(join(root, file)));
  }
  const merged = { ...fromFiles, ...process.env };
  merged.PINGGY_PANEL_TOKEN ||= merged.PINGGY_TOKEN;
  merged.STEPWHERE_PANEL_HOST ||= merged.PINGGY_DOMAIN;
  return merged;
}

function isExecutable(file) {
  try {
    accessSync(file, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * The Pinggy CLI (it reconnects on its own), from PINGGY_BIN, apps/dev-tunnel/bin
 * in either checkout, or PATH. Null means fall back to plain ssh.
 */
export function pinggyBinary(source = settings()) {
  const candidates = [
    source.PINGGY_BIN,
    ...setupRoots().reverse().map((root) => join(root, "apps", "dev-tunnel", "bin", "pinggy")),
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (isExecutable(candidate)) return candidate;
  }
  const onPath = spawnSync("sh", ["-c", "command -v pinggy"], { encoding: "utf8" });
  return onPath.status === 0 ? onPath.stdout.trim() : null;
}

function lanAddress() {
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family === "IPv4" && !entry.internal) return entry.address;
    }
  }
  return "127.0.0.1";
}

export function devConfig(source = settings()) {
  const isPublic = source.STEPWHERE_PUBLIC === "1";
  const panelHost = source.STEPWHERE_PANEL_HOST || DEFAULT_PANEL_HOST;
  const shareHost = source.STEPWHERE_SHARE_HOST || "";
  const redisPassword = source.REDIS_PASSWORD || "stepwhere-dev";

  const local = {
    api: `http://localhost:${PORTS.server}`,
    apiInternal: `http://127.0.0.1:${PORTS.server}`,
    admin: `http://localhost:${PORTS.admin}`,
    share: `http://127.0.0.1:${PORTS.share}`,
    simulator: `http://127.0.0.1:${PORTS.simulator}`,
    ingest: `http://127.0.0.1:${PORTS.ingest}`,
  };

  const publicUrls = isPublic
    ? {
        panel: `https://${panelHost}`,
        share: shareHost ? `https://${shareHost}` : null,
        firmwareIngest: `http://${panelHost}/v1/telemetry/location`,
        agentDownload: `https://${panelHost}/downloads/stepwhere-qa-agent.tgz`,
      }
    : null;

  // The API's own origin. In public mode it is the panel host, because admin
  // and API share that origin so the session cookie is first-party.
  const apiPublic = publicUrls?.panel ?? local.api;
  const shareApp = publicUrls?.share ?? local.share;

  const browserOrigins = [
    local.admin,
    `http://127.0.0.1:${PORTS.admin}`,
    local.share,
    `http://localhost:${PORTS.share}`,
    local.simulator,
    `http://localhost:${PORTS.simulator}`,
    ...(publicUrls ? [publicUrls.panel, publicUrls.share].filter(Boolean) : []),
  ];

  return {
    isPublic,
    panelHost,
    shareHost,
    lanAddress: lanAddress(),
    redisPassword,
    database: `postgresql://postgres:postgres@127.0.0.1:${PORTS.postgres}/postgres`,
    redis: `redis://:${redisPassword}@127.0.0.1:${PORTS.redis}/0`,
    local,
    public: publicUrls,
    apiPublic,
    shareApp,
    browserOrigins: [...new Set(browserOrigins)],
    viteAllowedHosts: [panelHost, shareHost].filter(Boolean),
    useInfisical: source.STEPWHERE_INFISICAL !== "0",
  };
}

/** Environment overlay for one app. Applied on top of Infisical's values. */
export function appEnvironment(app, config = devConfig()) {
  const origins = config.browserOrigins.join(",");
  const allowedHosts = config.viteAllowedHosts.join(",");

  switch (app) {
    case "infra":
      return { REDIS_PASSWORD: config.redisPassword };
    case "migrate":
      return { LOCAL_DATABASE_URL: config.database, LOCAL_DIRECT_URL: config.database };
    case "server":
      return {
        NODE_ENV: "development",
        PORT: String(PORTS.server),
        DATABASE_URL: config.database,
        DIRECT_URL: config.database,
        REDIS_URL: config.redis,
        BETTER_AUTH_URL: config.apiPublic,
        BETTER_AUTH_TRUSTED_ORIGINS: origins,
        ADMIN_AUTH_ALLOWED_ORIGINS: origins,
        API_CORS_ALLOWED_ORIGINS: origins,
        PUBLIC_SHARE_APP_URL: config.shareApp,
        // The firmware and the ingest proxy send no ingest key.
        DEVICE_INGEST_AUTH_DISABLED: "true",
        QA_AGENT_SERVER_URL: config.apiPublic,
        ...(config.public ? { QA_AGENT_DOWNLOAD_URL: config.public.agentDownload } : {}),
      };
    case "ingest":
      return {
        PORT: String(PORTS.ingest),
        UPSTREAM_LOCATION_URL: `${config.local.apiInternal}/v1/telemetry/location`,
      };
    case "admin":
      // Empty API URL: the admin calls its own origin and Vite (locally) or
      // Caddy (public) forwards /v1 and /api/auth to the server.
      return {
        VITE_STEPWHERE_API_URL: "",
        VITE_STEPWHERE_AUTH_URL: "",
        STEPWHERE_DEV_API_TARGET: config.local.apiInternal,
        STEPWHERE_DEV_ALLOWED_HOSTS: allowedHosts,
      };
    case "share":
      return {
        VITE_API_URL: config.local.apiInternal,
        STEPWHERE_DEV_ALLOWED_HOSTS: allowedHosts,
      };
    case "simulator":
      return {
        VITE_API_URL: config.local.apiInternal,
        VITE_DEVICE_INGEST_PROXY_URL: config.local.ingest,
      };
    case "mobile": {
      // Phones can't reach localhost: use the tunnel in public mode, else the LAN IP.
      const api = config.public?.panel ?? `http://${config.lanAddress}:${PORTS.server}`;
      return { EXPO_PUBLIC_API_URL: api, EXPO_PUBLIC_AUTH_URL: `${api}/api/auth` };
    }
    case "edge":
      // Caddy needs a host for the share matcher even when the share tunnel is off.
      return { STEPWHERE_SHARE_HOST: config.shareHost || "share.invalid" };
    default:
      return {};
  }
}

export function localSecrets(app) {
  return LOCAL_SECRETS[app] ?? {};
}

/**
 * Environment for the Infisical CLI. A machine identity in the settings files
 * beats the CLI's personal login:
 *   INFISICAL_TOKEN                               an identity access token, used as is
 *   INFISICAL_CLIENT_ID + INFISICAL_CLIENT_SECRET universal auth, exchanged for a token here
 * INFISICAL_API_URL points the CLI at a self-hosted instance.
 */
function infisicalCliEnvironment(source) {
  const env = { ...process.env };
  if (source.INFISICAL_API_URL) env.INFISICAL_API_URL = source.INFISICAL_API_URL;
  if (source.INFISICAL_TOKEN) return { ok: true, env: { ...env, INFISICAL_TOKEN: source.INFISICAL_TOKEN }, auth: "INFISICAL_TOKEN" };
  if (source.INFISICAL_CLIENT_ID && source.INFISICAL_CLIENT_SECRET) {
    const login = spawnSync(
      "infisical",
      [
        "login",
        "--method=universal-auth",
        `--client-id=${source.INFISICAL_CLIENT_ID}`,
        `--client-secret=${source.INFISICAL_CLIENT_SECRET}`,
        "--silent",
        "--plain",
      ],
      { cwd: ROOT, env, encoding: "utf8", timeout: 30_000 },
    );
    const token = login.status === 0 ? login.stdout.trim().split("\n").pop() : "";
    if (!token) return { ok: false, reason: "universal-auth login with INFISICAL_CLIENT_ID/INFISICAL_CLIENT_SECRET failed" };
    return { ok: true, env: { ...env, INFISICAL_TOKEN: token }, auth: "machine identity" };
  }
  return { ok: true, env, auth: "infisical login" };
}

/**
 * Dev secrets for one Infisical project as { ok, secrets, auth, reason }.
 * Never throws; callers fall back to local stand-ins.
 */
export function fetchInfisicalSecrets(projectId, source = settings()) {
  const cli = infisicalCliEnvironment(source);
  if (!cli.ok) return { ok: false, secrets: {}, auth: "machine identity", reason: cli.reason };
  const result = spawnSync(
    "infisical",
    ["export", "--env=dev", `--projectId=${projectId}`, "--format=json", "--silent"],
    { cwd: ROOT, env: cli.env, encoding: "utf8", timeout: 30_000 },
  );
  if (result.error || result.status !== 0) {
    const output = `${result.stderr ?? ""}\n${result.stdout ?? ""}`;
    const reason =
      output.split("\n").find((line) => /^message:|error|denied|belong|login|unauthori[sz]ed|expired/i.test(line))?.trim() ||
      result.error?.message;
    return { ok: false, secrets: {}, auth: cli.auth, reason };
  }
  try {
    const parsed = JSON.parse(result.stdout);
    const entries = Array.isArray(parsed)
      ? parsed.map((entry) => [entry.key ?? entry.secretKey, entry.value ?? entry.secretValue])
      : Object.entries(parsed);
    return { ok: true, secrets: Object.fromEntries(entries.filter(([key]) => typeof key === "string")), auth: cli.auth };
  } catch {
    return { ok: false, secrets: {}, auth: cli.auth, reason: "could not parse `infisical export` output" };
  }
}
