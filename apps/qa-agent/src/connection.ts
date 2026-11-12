import { hostname, arch, platform } from "node:os";
import WebSocket from "ws";
import {
  QA_AGENT_PROTOCOL_VERSION,
  QA_DEFAULT_BAUD_RATE,
  type QaAgentHello,
  type QaAgentJob,
  type QaAgentToServerMessage,
  type QaConnectMode,
  type QaServerToAgentMessage,
} from "@stepwhere/types";
import { toWebSocketBase, type AgentConfig } from "./config.js";
import { HardwareMonitor } from "./hardware.js";
import { JobRunner } from "./jobs.js";
import * as log from "./log.js";
import { detectProgrammer, killAllProgrammerChildren } from "./programmer.js";
import { SerialManager } from "./serial.js";
import { AGENT_VERSION } from "./version.js";

export const TOKEN_REJECTED_MESSAGE =
  "This station's token was rejected. Ask an admin to re-pair the station, then run `stepwhere-qa-agent pair`.";

const BACKOFF_START_MS = 1_000;
const BACKOFF_MAX_MS = 30_000;
const STABLE_AFTER_MS = 60_000;
/** The server pings every 20 s; if it goes quiet for this long the socket is dead. */
const SILENCE_TIMEOUT_MS = 75_000;
const HANDSHAKE_TIMEOUT_MS = 15_000;

/** Exponential backoff with jitter: 1 s, 2 s, 4 s ... capped at 30 s. */
export function backoffDelayMs(attempt: number, random: () => number = Math.random): number {
  const base = Math.min(BACKOFF_MAX_MS, BACKOFF_START_MS * 2 ** Math.max(0, attempt));
  return Math.round(base * (0.75 + random() * 0.5));
}

const CONNECT_MODES: ReadonlySet<string> = new Set<QaConnectMode>(["normal", "underReset", "hotPlug"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Parses a raw frame into a server message, or null when it is malformed. Unknown types pass through. */
export function parseServerMessage(raw: string): { type: string; data: Record<string, unknown> } | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(value) || typeof value.type !== "string") return null;
  return { type: value.type, data: isRecord(value.data) ? value.data : {} };
}

function parseJob(data: Record<string, unknown>): QaAgentJob | null {
  const job = data.job;
  if (!isRecord(job) || typeof job.id !== "string") return null;
  if (job.kind !== "identify" && job.kind !== "flash") return null;
  if (typeof job.connectMode !== "string" || !CONNECT_MODES.has(job.connectMode)) return null;
  if (job.probeSerial !== null && typeof job.probeSerial !== "string") return null;
  return job as unknown as QaAgentJob;
}

/**
 * Connects to the server and serves it until `stop()`. Resolves with the process exit code:
 * 0 after a clean stop, 2 when the server rejected the station token.
 */
export class Agent {
  private ws: WebSocket | null = null;
  private stopping = false;
  private wake: (() => void) | null = null;
  private readonly serial: SerialManager;
  private readonly jobs: JobRunner;
  private readonly hardware: HardwareMonitor;

  constructor(private readonly config: AgentConfig) {
    const send = (message: QaAgentToServerMessage): boolean => this.send(message);
    this.serial = new SerialManager(send);
    this.jobs = new JobRunner(send);
    this.hardware = new HardwareMonitor(send, () => this.jobs.isBusy());
  }

  async run(): Promise<number> {
    this.hardware.start();
    let attempt = 0;
    let exitCode = 0;
    while (!this.stopping) {
      const startedAt = Date.now();
      const outcome = await this.connectOnce();
      if (outcome === "rejected") {
        log.error(TOKEN_REJECTED_MESSAGE);
        exitCode = 2;
        break;
      }
      if (this.stopping) break;
      attempt = Date.now() - startedAt >= STABLE_AFTER_MS ? 0 : attempt + 1;
      const delay = backoffDelayMs(attempt - 1);
      log.info(`Reconnecting in ${(delay / 1000).toFixed(1)} s`);
      await this.sleep(delay);
    }
    await this.shutdown();
    return exitCode;
  }

  stop(): void {
    if (this.stopping) return;
    this.stopping = true;
    this.ws?.close(1000, "agent stopping");
    this.wake?.();
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.wake = null;
        resolve();
      }, ms);
      this.wake = () => {
        clearTimeout(timer);
        this.wake = null;
        resolve();
      };
    });
  }

  private async shutdown(): Promise<void> {
    this.hardware.stop();
    this.jobs.abortAll();
    killAllProgrammerChildren();
    await this.serial.closeAll();
  }

  private send(message: QaAgentToServerMessage): boolean {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    log.debug(`-> ${message.type}`);
    ws.send(JSON.stringify(message));
    return true;
  }

  private connectOnce(): Promise<"closed" | "rejected"> {
    return new Promise((resolve) => {
      const url = `${toWebSocketBase(this.config.serverUrl)}/v1/qa/agent/ws`;
      log.info(`Connecting to ${url}`);
      const ws = new WebSocket(url, {
        headers: { Authorization: `Bearer ${this.config.token}` },
        handshakeTimeout: HANDSHAKE_TIMEOUT_MS,
        maxPayload: 8 * 1024 * 1024,
      });
      this.ws = ws;
      let settled = false;
      let opened = false;
      let silenceTimer: NodeJS.Timeout | undefined;

      const armSilenceTimer = (): void => {
        if (silenceTimer) clearTimeout(silenceTimer);
        silenceTimer = setTimeout(() => {
          log.warn("No traffic from the server for too long; reconnecting.");
          ws.terminate();
        }, SILENCE_TIMEOUT_MS);
      };
      const finish = (outcome: "closed" | "rejected"): void => {
        if (settled) return;
        settled = true;
        if (silenceTimer) clearTimeout(silenceTimer);
        if (this.ws === ws) this.ws = null;
        if (opened) {
          log.info("Disconnected from the server");
          // The server forgets serial sessions with the socket; close the ports so both sides agree.
          void this.serial.closeAll();
        }
        resolve(outcome);
      };

      ws.on("open", () => {
        opened = true;
        armSilenceTimer();
        void this.onOpen();
      });
      ws.on("message", (data, isBinary) => {
        armSilenceTimer();
        if (isBinary) return;
        this.onMessage(data.toString());
      });
      ws.on("unexpected-response", (_request, response) => {
        response.resume();
        const status = response.statusCode ?? 0;
        if (status === 401 || status === 403) {
          finish("rejected");
        } else {
          log.warn(`Server answered ${status} to the connection request.`);
          finish("closed");
        }
        ws.terminate();
      });
      ws.on("error", (error) => {
        if (!opened) log.warn(`Connection failed: ${error.message}`);
        else log.warn(`Socket error: ${error.message}`);
      });
      ws.on("close", () => finish("closed"));
    });
  }

  private async onOpen(): Promise<void> {
    const programmer = await detectProgrammer();
    const hello: QaAgentHello = {
      protocolVersion: QA_AGENT_PROTOCOL_VERSION,
      agentVersion: AGENT_VERSION,
      hostname: hostname(),
      platform: platform(),
      arch: arch(),
      nodeVersion: process.version,
      programmer,
    };
    this.send({ type: "agent.hello", data: hello });
    this.hardware.resetSent();
    await this.hardware.scanAndSend();
  }

  private onMessage(raw: string): void {
    const message = parseServerMessage(raw);
    if (!message) {
      log.debug("Ignoring malformed message");
      return;
    }
    log.debug(`<- ${message.type}`);
    try {
      this.handle(message as { type: QaServerToAgentMessage["type"] | string; data: Record<string, unknown> });
    } catch (error) {
      log.warn(`Failed to handle ${message.type}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private handle(message: { type: string; data: Record<string, unknown> }): void {
    const { type, data } = message;
    switch (type) {
      case "server.welcome":
        log.info(`Connected as station "${String(data.stationName ?? this.config.stationName)}"`);
        break;
      case "server.ping":
        this.send({
          type: "agent.pong",
          data: { sentAt: typeof data.sentAt === "string" ? data.sentAt : new Date().toISOString() },
        });
        break;
      case "hardware.scan":
        void this.hardware.scanAndSend();
        break;
      case "job.start": {
        const job = parseJob(data);
        if (!job) {
          const jobId = isRecord(data.job) && typeof data.job.id === "string" ? data.job.id : null;
          if (jobId) {
            this.send({
              type: "job.result",
              data: { jobId, ok: false, result: { target: null, verified: null, durationMs: 0, exitCode: null, error: "Malformed job." } },
            });
          }
          break;
        }
        this.jobs.start(job);
        break;
      }
      case "job.cancel":
        if (typeof data.jobId === "string") this.jobs.cancel(data.jobId);
        break;
      case "serial.open":
        if (typeof data.path === "string") {
          const baud = typeof data.baudRate === "number" ? data.baudRate : QA_DEFAULT_BAUD_RATE;
          void this.serial.open(data.path, baud);
        }
        break;
      case "serial.close":
        if (typeof data.path === "string") void this.serial.close(data.path);
        break;
      case "serial.write":
        if (typeof data.path === "string" && typeof data.data === "string") this.serial.write(data.path, data.data);
        break;
      default:
        log.debug(`Ignoring unknown message type ${type}`);
    }
  }
}
