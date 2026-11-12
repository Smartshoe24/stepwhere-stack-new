import { arch, hostname, platform } from "node:os";
import { existsSync } from "node:fs";
import type { QaAgentPairInput, QaAgentPairResult } from "@stepwhere/types";
import {
  configDir,
  configPath,
  deleteConfig,
  loadConfig,
  normalizeServerUrl,
  saveConfig,
  type AgentConfig,
} from "./config.js";
import { Agent } from "./connection.js";
import * as log from "./log.js";
import { detectProgrammer, scanProbes, setProgrammerPath } from "./programmer.js";
import { listPorts } from "./serial.js";
import { AGENT_VERSION } from "./version.js";

const HELP = `stepwhere-qa-agent ${AGENT_VERSION}

Bench agent for the Stepwhere QA panel: flashes firmware with STM32CubeProgrammer
and streams the device's TTL serial output.

Usage:
  stepwhere-qa-agent pair --server <url> --code <XXXX-XXXX> [--programmer <path>]
  stepwhere-qa-agent start [--verbose]        (default command)
  stepwhere-qa-agent doctor [--server <url>]
  stepwhere-qa-agent unpair

Options:
  --server <url>       API base URL, e.g. https://api.example.com
  --code <code>        Pairing code from Admin > QA > Bench > Pair station
  --programmer <path>  Full path to STM32_Programmer_CLI (saved in the config)
  --verbose            Log every WebSocket message type
  -h, --help           Show this help
  -v, --version        Show the agent version

Environment:
  STEPWHERE_QA_AGENT_HOME  Config directory (default ~/.stepwhere-qa-agent)
  STM32_PROGRAMMER_CLI     Full path to STM32_Programmer_CLI
`;

type ParsedArgs = {
  command: string | null;
  flags: Map<string, string | true>;
  unknown: string[];
};

const VALUE_FLAGS = new Set(["server", "code", "programmer"]);
const BOOLEAN_FLAGS = new Set(["verbose", "help", "version"]);

export function parseArgs(argv: string[]): ParsedArgs {
  const flags = new Map<string, string | true>();
  const unknown: string[] = [];
  let command: string | null = null;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] ?? "";
    if (arg === "-h") flags.set("help", true);
    else if (arg === "-v") flags.set("version", true);
    else if (arg.startsWith("--")) {
      const eq = arg.indexOf("=");
      const name = arg.slice(2, eq === -1 ? undefined : eq);
      if (VALUE_FLAGS.has(name)) {
        const value = eq === -1 ? argv[++i] : arg.slice(eq + 1);
        if (value === undefined || (eq === -1 && value.startsWith("--"))) {
          unknown.push(`--${name} needs a value`);
        } else {
          flags.set(name, value);
        }
      } else if (BOOLEAN_FLAGS.has(name)) {
        flags.set(name, true);
      } else {
        unknown.push(arg);
      }
    } else if (command === null) {
      command = arg;
    } else {
      unknown.push(arg);
    }
  }
  return { command, flags, unknown };
}

function flagString(args: ParsedArgs, name: string): string | undefined {
  const value = args.flags.get(name);
  return typeof value === "string" ? value : undefined;
}

function fail(message: string, code = 1): never {
  console.error(message);
  process.exit(code);
}

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { message?: unknown };
    if (typeof body.message === "string") return body.message;
  } catch {
    // fall through
  }
  return `HTTP ${response.status}`;
}

async function commandPair(args: ParsedArgs): Promise<void> {
  const serverInput = flagString(args, "server");
  const codeInput = flagString(args, "code");
  if (!serverInput || !codeInput) {
    fail("Usage: stepwhere-qa-agent pair --server <url> --code <XXXX-XXXX> [--programmer <path>]");
  }
  let serverUrl: string;
  try {
    serverUrl = normalizeServerUrl(serverInput);
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error));
  }
  const programmerPath = flagString(args, "programmer");
  if (programmerPath && !existsSync(programmerPath)) {
    log.warn(`No file at ${programmerPath}; saving it anyway. Run \`stepwhere-qa-agent doctor\` to check.`);
  }

  const body: QaAgentPairInput = {
    code: codeInput.trim().toUpperCase(),
    hostname: hostname(),
    platform: `${platform()}-${arch()}`,
    agentVersion: AGENT_VERSION,
  };
  let response: Response;
  try {
    response = await fetch(`${serverUrl}/v1/qa/agent/pair`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
  } catch (error) {
    return fail(`Could not reach ${serverUrl}: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!response.ok) {
    const message = await readError(response);
    if (response.status === 400 || response.status === 401) {
      return fail(`Pairing failed: ${message}. Generate a fresh code in Admin > QA > Bench and try again.`);
    }
    return fail(`Pairing failed: ${message}`);
  }
  const payload = (await response.json()) as { data?: QaAgentPairResult };
  const result = payload.data;
  if (!result || typeof result.token !== "string" || typeof result.stationId !== "string") {
    return fail("Pairing failed: unexpected response from the server.");
  }
  const config: AgentConfig = {
    serverUrl,
    stationId: result.stationId,
    stationName: result.stationName,
    token: result.token,
    ...(programmerPath ? { programmerPath } : {}),
  };
  saveConfig(config);
  console.log(`Paired as station "${result.stationName}".`);
  console.log(`Config saved to ${configPath()}`);
  console.log("Run `stepwhere-qa-agent start` to connect.");
}

function requireConfig(): AgentConfig {
  let config: AgentConfig | null;
  try {
    config = loadConfig();
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error));
  }
  if (!config) {
    return fail(
      "This machine is not paired yet.\n" +
        "In the admin panel open QA > Bench > Pair station, then run:\n" +
        "  stepwhere-qa-agent pair --server https://<api host> --code XXXX-XXXX",
    );
  }
  return config;
}

async function commandStart(args: ParsedArgs): Promise<void> {
  const config = requireConfig();
  log.setVerbose(args.flags.has("verbose"));
  setProgrammerPath(config.programmerPath);
  log.info(`stepwhere-qa-agent ${AGENT_VERSION} for station "${config.stationName}" (${config.serverUrl})`);

  const programmer = await detectProgrammer();
  if (programmer.found) log.info(`STM32CubeProgrammer ${programmer.version ?? "(unknown version)"} at ${programmer.path}`);
  else log.warn(`${programmer.error ?? "STM32_Programmer_CLI not found."} Flashing is unavailable until it is installed.`);

  const agent = new Agent(config);
  let signals = 0;
  const onSignal = (signal: string): void => {
    signals += 1;
    if (signals > 1) process.exit(130);
    log.info(`${signal} received, shutting down`);
    agent.stop();
  };
  process.on("SIGINT", () => onSignal("SIGINT"));
  process.on("SIGTERM", () => onSignal("SIGTERM"));

  const exitCode = await agent.run();
  process.exit(exitCode);
}

async function commandDoctor(args: ParsedArgs): Promise<void> {
  let config: AgentConfig | null = null;
  let configError: string | null = null;
  try {
    config = loadConfig();
  } catch (error) {
    configError = error instanceof Error ? error.message : String(error);
  }
  setProgrammerPath(config?.programmerPath);

  console.log(`stepwhere-qa-agent ${AGENT_VERSION}`);
  console.log(`Node:            ${process.version} (${platform()}-${arch()})`);
  console.log(`Config dir:      ${configDir()}`);
  console.log(`Config file:     ${configPath()}${existsSync(configPath()) ? "" : " (missing)"}`);
  if (configError) console.log(`Config problem:  ${configError}`);

  let serverUrl: string | null = config?.serverUrl ?? null;
  const serverFlag = flagString(args, "server");
  if (serverFlag) {
    try {
      serverUrl = normalizeServerUrl(serverFlag);
    } catch (error) {
      console.log(`Server URL:      ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (config) {
    console.log(`Server URL:      ${config.serverUrl}`);
    console.log(`Station:         ${config.stationName} (${config.stationId})`);
  } else {
    console.log("Paired:          no - not paired yet. Run `stepwhere-qa-agent pair --server <url> --code XXXX-XXXX`.");
  }

  console.log("");
  const programmer = await detectProgrammer();
  if (programmer.found) {
    console.log(`CubeProgrammer:  ${programmer.path}`);
    console.log(`  version:       ${programmer.version ?? "unknown"}${programmer.error ? ` (${programmer.error})` : ""}`);
  } else {
    console.log("CubeProgrammer:  NOT FOUND");
    console.log(`  fix:           ${programmer.error ?? "Install STM32CubeProgrammer from st.com or set STM32_PROGRAMMER_CLI."}`);
  }

  console.log("");
  if (programmer.found) {
    const scan = await scanProbes();
    if (scan.error) console.log(`ST-LINK probes:  scan failed: ${scan.error}`);
    else if (scan.probes.length === 0) console.log("ST-LINK probes:  none (No ST-Link detected)");
    else {
      console.log(`ST-LINK probes:  ${scan.probes.length}`);
      for (const probe of scan.probes) {
        console.log(`  - ${probe.serial}  fw ${probe.firmware ?? "?"}  board ${probe.boardName ?? "-"}`);
      }
    }
  } else {
    console.log("ST-LINK probes:  skipped (CubeProgrammer not found)");
  }

  console.log("");
  try {
    const ports = await listPorts();
    const ttl = ports.filter((p) => p.likelyUsbTtl).length;
    console.log(`Serial ports:    ${ports.length} (${ttl} likely USB-TTL)`);
    for (const port of ports) {
      const ids = port.vendorId ? ` [${port.vendorId}:${port.productId ?? "????"}]` : "";
      const label = port.manufacturer ? ` ${port.manufacturer}` : "";
      console.log(`  ${port.likelyUsbTtl ? "*" : "-"} ${port.path}${ids}${label}${port.likelyUsbTtl ? "  <- likely USB-TTL" : ""}`);
    }
  } catch (error) {
    console.log(`Serial ports:    could not list: ${error instanceof Error ? error.message : String(error)}`);
  }

  console.log("");
  if (serverUrl) {
    try {
      const response = await fetch(`${serverUrl}/health`, { signal: AbortSignal.timeout(10_000) });
      console.log(`Server health:   ${response.ok ? "OK" : "FAILED"} (GET ${serverUrl}/health -> HTTP ${response.status})`);
    } catch (error) {
      console.log(`Server health:   FAILED (${error instanceof Error ? error.message : String(error)})`);
    }
  } else {
    console.log("Server health:   skipped (no server URL; pair first or pass --server)");
  }
  process.exit(0);
}

function commandUnpair(): void {
  if (deleteConfig()) console.log(`Removed ${configPath()}. This machine is no longer paired.`);
  else console.log("Nothing to remove: this machine is not paired.");
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.flags.has("help")) {
    console.log(HELP);
    return;
  }
  if (args.flags.has("version")) {
    console.log(AGENT_VERSION);
    return;
  }
  if (args.unknown.length > 0) fail(`Unknown argument: ${args.unknown.join(" ")}\n\n${HELP}`);

  switch (args.command ?? "start") {
    case "pair":
      return commandPair(args);
    case "start":
      return commandStart(args);
    case "doctor":
      return commandDoctor(args);
    case "unpair":
      return commandUnpair();
    case "help":
      console.log(HELP);
      return;
    default:
      fail(`Unknown command "${args.command}".\n\n${HELP}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
