import { spawn, type ChildProcess } from "node:child_process";
import { accessSync, constants, statSync } from "node:fs";
import { homedir, platform } from "node:os";
import { delimiter, isAbsolute, join } from "node:path";
import { StringDecoder } from "node:string_decoder";
import type { QaConnectMode, QaFirmwareFormat, QaFlashPhase, QaProbe, QaProgrammerInfo, QaTargetInfo } from "@stepwhere/types";

// ---------------------------------------------------------------------------
// Output parsing (pure)
// ---------------------------------------------------------------------------

// eslint-disable-next-line no-control-regex
const ANSI_PATTERN = /\u001b(?:\[[0-?]*[ -/]*[@-~]|\][^\u0007\u001b]*(?:\u0007|\u001b\\)|[@-Z\\-_])/g;

export function stripAnsi(text: string): string {
  return text.replace(ANSI_PATTERN, "");
}

/**
 * Turns a byte/char stream into lines. The CLI redraws progress bars with `\r`, so both `\r` and
 * `\n` end a line. ANSI codes are removed and empty lines dropped. Call `flush()` at end of stream.
 */
export function createLineSplitter(onLine: (line: string) => void): {
  push: (chunk: string) => void;
  flush: () => void;
} {
  let pending = "";
  const emit = (raw: string): void => {
    const line = stripAnsi(raw).trim();
    if (line.length > 0) onLine(line);
  };
  return {
    push(chunk) {
      pending += chunk;
      const parts = pending.split(/[\r\n]/);
      pending = parts.pop() ?? "";
      for (const part of parts) emit(part);
    },
    flush() {
      if (pending.length > 0) emit(pending);
      pending = "";
    },
  };
}

/** Splits a whole captured blob (used by tests and for one-shot parsing). */
export function splitProgrammerOutput(text: string): string[] {
  const lines: string[] = [];
  const splitter = createLineSplitter((line) => lines.push(line));
  splitter.push(text);
  splitter.flush();
  return lines;
}

export function parseVersion(lines: string[]): string | null {
  for (const line of lines) {
    const match = /STM32CubeProgrammer version:\s*([0-9][0-9A-Za-z.\-_]*)/i.exec(line);
    if (match) return match[1] ?? null;
  }
  return null;
}

function keyValue(line: string): { key: string; value: string } | null {
  const match = /^\s*([A-Za-z][A-Za-z0-9 _\-/]*?)\s*:\s*(.*?)\s*$/.exec(line);
  if (!match) return null;
  return { key: (match[1] ?? "").toLowerCase(), value: match[2] ?? "" };
}

/** Parses the `-l st-link` listing. "No ST-Link detected!" yields an empty list. */
export function parseProbes(lines: string[]): QaProbe[] {
  const probes: QaProbe[] = [];
  let current: { serial: string | null; firmware: string | null; boardName: string | null } | null = null;
  const finish = (): void => {
    if (current?.serial) {
      probes.push({ serial: current.serial, firmware: current.firmware, boardName: current.boardName });
    }
    current = null;
  };
  for (const line of lines) {
    if (/^ST-Link Probe\s+\d+\s*:?/i.test(line)) {
      finish();
      current = { serial: null, firmware: null, boardName: null };
      continue;
    }
    if (!current) continue;
    const kv = keyValue(line);
    if (!kv) continue;
    const value = kv.value === "" || kv.value === "--" ? null : kv.value;
    if (kv.key === "st-link sn") current.serial = value;
    else if (kv.key === "st-link fw") current.firmware = value;
    else if (kv.key === "board name") current.boardName = value;
  }
  finish();
  return probes;
}

function parseFlashSizeKb(value: string): number | null {
  const match = /^(\d+(?:\.\d+)?)\s*([KMG]?)B(?:ytes?)?/i.exec(value);
  if (!match) return null;
  const amount = Number(match[1]);
  const unit = (match[2] ?? "").toUpperCase();
  const kb = unit === "M" ? amount * 1024 : unit === "G" ? amount * 1024 * 1024 : unit === "K" ? amount : amount / 1024;
  return Number.isFinite(kb) ? Math.round(kb) : null;
}

/** Parses the `key : value` block printed after a successful connect. */
export function parseTargetInfo(lines: string[]): QaTargetInfo {
  const info: QaTargetInfo = { deviceId: null, deviceName: null, flashSizeKb: null, voltage: null, uid: null };
  for (const line of lines) {
    const kv = keyValue(line);
    if (!kv || kv.value === "") continue;
    switch (kv.key) {
      case "device id":
        info.deviceId ??= kv.value;
        break;
      case "device name":
        info.deviceName ??= kv.value;
        break;
      case "flash size":
        info.flashSizeKb ??= parseFlashSizeKb(kv.value);
        break;
      case "voltage":
        info.voltage ??= kv.value;
        break;
    }
  }
  info.uid = parseUid(lines);
  return info;
}

export const UID_BASE_ADDRESS = "0x1FFF7590";

/** Reads the `-r32 0x1FFF7590 12` output: `0x1FFF7590 : 00390029 3A2F5143 91C40000`. */
export function parseUid(lines: string[]): string | null {
  for (const line of lines) {
    const match = /^0x1FFF7590\s*:\s*(.+)$/i.exec(line);
    if (!match) continue;
    const words = (match[1] ?? "").trim().split(/\s+/);
    const hex = words.join("");
    if (words.length >= 1 && /^[0-9A-Fa-f]{24}$/.test(hex)) return hex.toUpperCase();
  }
  return null;
}

/** First line the CLI reports as an error (`Error: ...`), without the prefix. */
export function findErrorLine(lines: string[]): string | null {
  for (const line of lines) {
    const match = /^Error:\s*(.*)$/i.exec(line);
    if (match) return (match[1] ?? "").trim() || "Programmer reported an error.";
  }
  return null;
}

export function sawVerified(lines: string[]): boolean {
  return lines.some((line) => /download verified successfully/i.test(line));
}

export type ProgressUpdate = { phase: QaFlashPhase; percent: number | null };

/**
 * Maps CubeProgrammer download output to flash phases. Feed lines in order; `update` returns the
 * new state when the phase or percent changed, otherwise null.
 */
export function createProgressTracker(): {
  update: (line: string) => ProgressUpdate | null;
  current: () => ProgressUpdate;
} {
  let state: ProgressUpdate = { phase: "connecting", percent: null };
  const set = (phase: QaFlashPhase, percent: number | null): ProgressUpdate | null => {
    if (state.phase === phase && state.percent === percent) return null;
    state = { phase, percent };
    return state;
  };
  return {
    current: () => state,
    update(line) {
      if (/^Erasing\b/i.test(line)) return set("erasing", null);
      if (/Download in Progress/i.test(line)) return set("programming", 0);
      if (/File download complete/i.test(line)) return set("programming", 100);
      if (/Read progress/i.test(line) || /^Verifying\b/i.test(line)) return set("verifying", 0);
      if (/Download verified successfully/i.test(line)) return set("verifying", 100);
      if (/MCU Reset|Software reset is performed|Hard reset is performed|System reset is performed/i.test(line)) {
        return set("resetting", null);
      }
      if (state.phase === "programming" || state.phase === "verifying") {
        const matches = [...line.matchAll(/(\d{1,3})\s*%/g)];
        const last = matches[matches.length - 1];
        if (last) {
          const percent = Math.min(100, Number(last[1]));
          // Percent never goes backwards within one phase (the bar can redraw the same value).
          if (state.percent === null || percent >= state.percent) return set(state.phase, percent);
        }
      }
      return null;
    },
  };
}

// ---------------------------------------------------------------------------
// Argument builders (strict validation: nothing server-provided reaches the CLI unchecked)
// ---------------------------------------------------------------------------

const PROBE_SERIAL_PATTERN = /^[0-9A-Za-z]{4,64}$/;
const ADDRESS_PATTERN = /^0x[0-9A-Fa-f]{1,8}$/;

export function validateProbeSerial(serial: string | null): string | null {
  if (serial === null) return null;
  if (typeof serial !== "string" || !PROBE_SERIAL_PATTERN.test(serial)) {
    throw new Error("Invalid ST-LINK serial number.");
  }
  return serial;
}

export function validateAddress(address: string): string {
  if (typeof address !== "string" || !ADDRESS_PATTERN.test(address)) {
    throw new Error("Invalid flash address; expected hex like 0x08000000.");
  }
  return address;
}

export function connectModeArg(mode: QaConnectMode): string {
  switch (mode) {
    case "normal":
      return "mode=NORMAL";
    case "underReset":
      return "mode=UR";
    case "hotPlug":
      return "mode=HOTPLUG";
    default:
      throw new Error("Invalid connect mode.");
  }
}

export function buildListProbesArgs(): string[] {
  return ["-l", "st-link"];
}

export function buildConnectArgs(probeSerial: string | null, mode: QaConnectMode): string[] {
  const serial = validateProbeSerial(probeSerial);
  return ["-c", "port=SWD", "freq=4000", ...(serial ? [`sn=${serial}`] : []), connectModeArg(mode)];
}

export function buildIdentifyArgs(probeSerial: string | null, mode: QaConnectMode): string[] {
  return [...buildConnectArgs(probeSerial, mode), "-r32", UID_BASE_ADDRESS, "12"];
}

export function buildFlashArgs(input: {
  probeSerial: string | null;
  connectMode: QaConnectMode;
  filePath: string;
  format: QaFirmwareFormat;
  address: string;
}): string[] {
  const { filePath, format } = input;
  // eslint-disable-next-line no-control-regex
  if (typeof filePath !== "string" || !isAbsolute(filePath) || /[\u0000-\u001f]/.test(filePath)) {
    throw new Error("Invalid firmware file path.");
  }
  if (format !== "bin" && format !== "hex") throw new Error("Invalid firmware format.");
  const address = format === "bin" ? validateAddress(input.address) : null;
  return [
    ...buildConnectArgs(input.probeSerial, input.connectMode),
    // Read the chip UID first, so even a failed flash records which board it was.
    "-r32",
    UID_BASE_ADDRESS,
    "12",
    "-d",
    filePath,
    ...(address ? [address] : []),
    "-v",
    "-rst",
  ];
}

// ---------------------------------------------------------------------------
// Locating the CLI
// ---------------------------------------------------------------------------

function isExecutable(file: string): boolean {
  try {
    if (!statSync(file).isFile()) return false;
    accessSync(file, platform() === "win32" ? constants.F_OK : constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export function defaultProgrammerPaths(os: NodeJS.Platform = platform(), home: string = homedir()): string[] {
  if (os === "darwin") {
    const app = "/Applications/STMicroelectronics/STM32Cube/STM32CubeProgrammer/STM32CubeProgrammer.app/Contents";
    return [`${app}/Resources/bin/STM32_Programmer_CLI`, `${app}/MacOs/bin/STM32_Programmer_CLI`];
  }
  if (os === "win32") {
    const tail = "STMicroelectronics\\STM32Cube\\STM32CubeProgrammer\\bin\\STM32_Programmer_CLI.exe";
    return [`C:\\Program Files\\${tail}`, `C:\\Program Files (x86)\\${tail}`];
  }
  return [
    join(home, "STMicroelectronics/STM32Cube/STM32CubeProgrammer/bin/STM32_Programmer_CLI"),
    "/usr/local/STMicroelectronics/STM32Cube/STM32CubeProgrammer/bin/STM32_Programmer_CLI",
    "/opt/st/stm32cubeprogrammer/bin/STM32_Programmer_CLI",
  ];
}

function findOnPath(): string | null {
  const exe = platform() === "win32" ? "STM32_Programmer_CLI.exe" : "STM32_Programmer_CLI";
  for (const dir of (process.env.PATH ?? "").split(delimiter)) {
    if (!dir) continue;
    const candidate = join(dir, exe);
    if (isExecutable(candidate)) return candidate;
  }
  return null;
}

let configuredPath: string | undefined;

/** Path from `--programmer` or config.json; takes priority over env, PATH and defaults. */
export function setProgrammerPath(path: string | undefined): void {
  configuredPath = path || undefined;
}

export type ResolvedProgrammer = { ok: true; path: string; source: string } | { ok: false; path: null; error: string };

export function resolveProgrammerPath(): ResolvedProgrammer {
  if (configuredPath) {
    if (isExecutable(configuredPath)) return { ok: true, path: configuredPath, source: "configured path" };
    return { ok: false, path: null, error: `Configured programmer path does not exist or is not executable: ${configuredPath}` };
  }
  const fromEnv = process.env.STM32_PROGRAMMER_CLI;
  if (fromEnv) {
    if (isExecutable(fromEnv)) return { ok: true, path: fromEnv, source: "STM32_PROGRAMMER_CLI" };
    return { ok: false, path: null, error: `STM32_PROGRAMMER_CLI points to a missing file: ${fromEnv}` };
  }
  const onPath = findOnPath();
  if (onPath) return { ok: true, path: onPath, source: "PATH" };
  for (const candidate of defaultProgrammerPaths()) {
    if (isExecutable(candidate)) return { ok: true, path: candidate, source: "default install location" };
  }
  return {
    ok: false,
    path: null,
    error:
      "STM32_Programmer_CLI not found. Install STM32CubeProgrammer from st.com, or set STM32_PROGRAMMER_CLI " +
      "(or pass --programmer <path> to `pair`) to the full path of the executable.",
  };
}

// ---------------------------------------------------------------------------
// Running the CLI
// ---------------------------------------------------------------------------

export type ProgrammerRun = {
  exitCode: number | null;
  lines: string[];
  timedOut: boolean;
  aborted: boolean;
};

export type RunOptions = {
  onLine?: (line: string) => void;
  signal?: AbortSignal;
  timeoutMs?: number;
  /** Override the executable (tests). */
  programmerPath?: string;
  /**
   * Default true: wait for any other exclusive invocation (probe scans, version checks) so they
   * never overlap. Bench jobs pass false so jobs on different ST-LINKs run side by side.
   */
  exclusive?: boolean;
};

let lockTail: Promise<void> = Promise.resolve();
let lockHeld = 0;

let concurrentRuns = 0;

/** True while a CubeProgrammer invocation is running or queued. */
export function isProgrammerBusy(): boolean {
  return lockHeld > 0 || concurrentRuns > 0;
}

async function withProgrammerLock<T>(fn: () => Promise<T>): Promise<T> {
  lockHeld += 1;
  const previous = lockTail;
  let release!: () => void;
  lockTail = new Promise<void>((resolve) => {
    release = resolve;
  });
  try {
    await previous;
    return await fn();
  } finally {
    lockHeld -= 1;
    release();
  }
}

const activeChildren = new Set<ChildProcess>();

/** Kills any running CubeProgrammer child (called on agent shutdown). */
export function killAllProgrammerChildren(): void {
  for (const child of activeChildren) child.kill("SIGKILL");
}

/**
 * Runs the CLI once. Exclusive invocations (the default: scans, version checks) run one at a time
 * process-wide; `exclusive: false` runs (bench jobs, one per ST-LINK) do not queue behind anything.
 * Arguments must come from the builders above; the process is spawned directly, never through a shell.
 */
export function runProgrammer(args: string[], options: RunOptions = {}): Promise<ProgrammerRun> {
  if (options.exclusive === false) {
    concurrentRuns += 1;
    return runProgrammerUnlocked(args, options).finally(() => {
      concurrentRuns -= 1;
    });
  }
  return withProgrammerLock(() => runProgrammerUnlocked(args, options));
}

function runProgrammerUnlocked(args: string[], options: RunOptions): Promise<ProgrammerRun> {
  const resolved: ResolvedProgrammer = options.programmerPath
    ? { ok: true, path: options.programmerPath, source: "override" }
    : resolveProgrammerPath();
  if (!resolved.ok) return Promise.reject(new Error(resolved.error));
  const { signal, timeoutMs } = options;
  if (signal?.aborted) {
    return Promise.resolve({ exitCode: null, lines: [], timedOut: false, aborted: true });
  }

  return new Promise<ProgrammerRun>((resolve, reject) => {
    const lines: string[] = [];
    const onLine = (line: string): void => {
      lines.push(line);
      options.onLine?.(line);
    };
    const child = spawn(resolved.path, args, { shell: false, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    activeChildren.add(child);

    let timedOut = false;
    let aborted = false;
    let settled = false;
    let killTimer: NodeJS.Timeout | undefined;
    let timeoutTimer: NodeJS.Timeout | undefined;

    const terminate = (): void => {
      if (child.exitCode !== null || child.signalCode !== null) return;
      child.kill("SIGTERM");
      killTimer = setTimeout(() => child.kill("SIGKILL"), 2000);
    };
    const onAbort = (): void => {
      aborted = true;
      terminate();
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    if (timeoutMs !== undefined) {
      timeoutTimer = setTimeout(() => {
        timedOut = true;
        terminate();
      }, timeoutMs);
    }

    const cleanup = (): void => {
      activeChildren.delete(child);
      signal?.removeEventListener("abort", onAbort);
      if (timeoutTimer) clearTimeout(timeoutTimer);
      if (killTimer) clearTimeout(killTimer);
    };

    for (const stream of [child.stdout, child.stderr]) {
      const splitter = createLineSplitter(onLine);
      const decoder = new StringDecoder("utf8");
      stream.on("data", (chunk: Buffer) => splitter.push(decoder.write(chunk)));
      stream.on("end", () => {
        splitter.push(decoder.end());
        splitter.flush();
      });
    }

    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(`Could not start STM32_Programmer_CLI: ${err.message}`));
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve({ exitCode: code, lines, timedOut, aborted });
    });
  });
}

// ---------------------------------------------------------------------------
// High level helpers
// ---------------------------------------------------------------------------

let cachedVersion: { path: string; version: string | null } | null = null;

/** Locates the CLI and reads its version. Never throws. */
export async function detectProgrammer(): Promise<QaProgrammerInfo> {
  const resolved = resolveProgrammerPath();
  if (!resolved.ok) return { found: false, path: null, version: null, error: resolved.error };
  if (cachedVersion?.path === resolved.path && cachedVersion.version) {
    return { found: true, path: resolved.path, version: cachedVersion.version, error: null };
  }
  try {
    const run = await runProgrammer(["--version"], { timeoutMs: 15_000 });
    const version = parseVersion(run.lines);
    if (!version) {
      return {
        found: true,
        path: resolved.path,
        version: null,
        error: run.timedOut ? "STM32_Programmer_CLI --version timed out." : "Could not read the STM32CubeProgrammer version.",
      };
    }
    cachedVersion = { path: resolved.path, version };
    return { found: true, path: resolved.path, version, error: null };
  } catch (error) {
    return { found: true, path: resolved.path, version: null, error: error instanceof Error ? error.message : String(error) };
  }
}

export type ProbeScan = { probes: QaProbe[]; error: string | null };

/** Lists ST-LINK probes. Never throws; errors are reported in the result. */
export async function scanProbes(): Promise<ProbeScan> {
  try {
    const run = await runProgrammer(buildListProbesArgs(), { timeoutMs: 20_000 });
    if (run.timedOut) return { probes: [], error: "ST-LINK scan timed out." };
    const probes = parseProbes(run.lines);
    if (probes.length === 0 && run.exitCode !== 0 && run.exitCode !== null && !run.lines.some((l) => /No ST-Link detected/i.test(l))) {
      return { probes, error: findErrorLine(run.lines) ?? `ST-LINK scan exited with code ${run.exitCode}.` };
    }
    return { probes, error: null };
  } catch (error) {
    return { probes: [], error: error instanceof Error ? error.message : String(error) };
  }
}
