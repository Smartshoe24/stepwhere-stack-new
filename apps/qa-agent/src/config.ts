import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type AgentConfig = {
  serverUrl: string;
  stationId: string;
  stationName: string;
  token: string;
  programmerPath?: string;
};

export function configDir(): string {
  return process.env.STEPWHERE_QA_AGENT_HOME || join(homedir(), ".stepwhere-qa-agent");
}

export function configPath(): string {
  return join(configDir(), "config.json");
}

/** Strips trailing slashes and requires http/https. Throws on anything else. */
export function normalizeServerUrl(input: string): string {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new Error(`"${input}" is not a valid URL. Use something like https://api.example.com`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`Server URL must start with http:// or https:// (got ${url.protocol}//).`);
  }
  url.hash = "";
  url.search = "";
  return url.toString().replace(/\/+$/, "");
}

/** http -> ws, https -> wss. */
export function toWebSocketBase(serverUrl: string): string {
  return serverUrl.replace(/^http/i, "ws");
}

export function loadConfig(): AgentConfig | null {
  const file = configPath();
  if (!existsSync(file)) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    throw new Error(`Config file ${file} is not valid JSON. Delete it and pair again.`);
  }
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (
    typeof r.serverUrl !== "string" ||
    typeof r.stationId !== "string" ||
    typeof r.stationName !== "string" ||
    typeof r.token !== "string" ||
    r.token.length === 0
  ) {
    return null;
  }
  return {
    serverUrl: r.serverUrl,
    stationId: r.stationId,
    stationName: r.stationName,
    token: r.token,
    ...(typeof r.programmerPath === "string" && r.programmerPath ? { programmerPath: r.programmerPath } : {}),
  };
}

export function saveConfig(config: AgentConfig): void {
  const dir = configDir();
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  try {
    chmodSync(dir, 0o700);
  } catch {
    // Not fatal (e.g. Windows).
  }
  const file = configPath();
  writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  try {
    chmodSync(file, 0o600);
  } catch {
    // Not fatal.
  }
}

/** Deletes the stored config (and with it the token). Returns whether anything was removed. */
export function deleteConfig(): boolean {
  const file = configPath();
  if (!existsSync(file)) return false;
  rmSync(file, { force: true });
  return true;
}
