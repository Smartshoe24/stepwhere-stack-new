import { createHash } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  QA_FIRMWARE_MAX_BYTES,
  type QaAgentJob,
  type QaAgentToServerMessage,
  type QaFlashPhase,
  type QaJobResult,
  type QaTargetInfo,
} from "@stepwhere/types";
import * as log from "./log.js";
import {
  buildFlashArgs,
  buildIdentifyArgs,
  createProgressTracker,
  findErrorLine,
  parseTargetInfo,
  runProgrammer,
  sawVerified,
  type ProgrammerRun,
} from "./programmer.js";

export const IDENTIFY_TIMEOUT_MS = 60_000;
export const FLASH_TIMEOUT_MS = 180_000;
export const LOG_FLUSH_MS = 250;
export const LOG_FLUSH_LINES = 50;
export const PROGRESS_MIN_INTERVAL_MS = 200;

const JOB_ID_PATTERN = /^[0-9A-Za-z_-]{1,64}$/;

type Send = (message: QaAgentToServerMessage) => void;

type Running = {
  id: string;
  /** ST-LINK serial this job uses; null means "any probe" (exclusive). */
  probeSerial: string | null;
  controller: AbortController;
  cancelled: boolean;
};

function emptyResult(startedAt: number, error: string | null): QaJobResult {
  return { target: null, verified: null, durationMs: Date.now() - startedAt, exitCode: null, error };
}

const BUSY_MESSAGE = "Agent is busy with another job. Pick an ST-LINK to run jobs side by side.";

export class JobRunner {
  private readonly running = new Map<string, Running>();

  constructor(
    private readonly send: Send,
    /** Called with true on the 0 to 1 running-job transition and false on 1 to 0, so hardware scanning can pause. */
    private readonly onBusyChange: (busy: boolean) => void = () => {},
    private readonly runCli: typeof runProgrammer = runProgrammer,
  ) {}

  isBusy(): boolean {
    return this.running.size > 0;
  }

  start(job: QaAgentJob): void {
    if (this.running.has(job.id)) return;
    const probeSerial = job.probeSerial ?? null;
    const rejection = this.admissionError(probeSerial);
    if (rejection) {
      this.send({ type: "job.result", data: { jobId: job.id, ok: false, result: emptyResult(Date.now(), rejection) } });
      return;
    }
    const running: Running = { id: job.id, probeSerial, controller: new AbortController(), cancelled: false };
    this.running.set(job.id, running);
    if (this.running.size === 1) this.onBusyChange(true);
    this.send({ type: "job.accepted", data: { jobId: job.id } });
    log.info(`Job ${job.id} started (${job.kind})`);
    void this.run(job, running).finally(() => {
      this.running.delete(job.id);
      if (this.running.size === 0) this.onBusyChange(false);
    });
  }

  /** Why a new job on `probeSerial` cannot start right now, or null if it can. */
  private admissionError(probeSerial: string | null): string | null {
    for (const other of this.running.values()) {
      // A job without a chosen probe may grab any ST-LINK, so it excludes (and is excluded by) everything.
      if (probeSerial === null || other.probeSerial === null) return BUSY_MESSAGE;
      if (other.probeSerial === probeSerial) return `ST-LINK ${probeSerial} is busy with another job.`;
    }
    return null;
  }

  cancel(jobId: string): void {
    const running = this.running.get(jobId);
    if (!running) return;
    running.cancelled = true;
    running.controller.abort();
    log.info(`Job ${jobId} cancel requested`);
  }

  /** Aborts every running job on shutdown (no results are sent; the socket is going away). */
  abortAll(): void {
    for (const running of this.running.values()) running.controller.abort();
  }

  private async run(job: QaAgentJob, running: Running): Promise<void> {
    const startedAt = Date.now();
    const jobId = job.id;

    // --- log batching -------------------------------------------------------
    let logBuffer: string[] = [];
    let logTimer: NodeJS.Timeout | undefined;
    const flushLog = (): void => {
      if (logTimer) clearTimeout(logTimer);
      logTimer = undefined;
      if (logBuffer.length === 0) return;
      const lines = logBuffer;
      logBuffer = [];
      this.send({ type: "job.log", data: { jobId, lines } });
    };
    const pushLog = (line: string): void => {
      logBuffer.push(line);
      if (logBuffer.length >= LOG_FLUSH_LINES) flushLog();
      else if (!logTimer) logTimer = setTimeout(flushLog, LOG_FLUSH_MS);
    };

    // --- progress throttling ------------------------------------------------
    let lastSent: { phase: QaFlashPhase; percent: number | null } | null = null;
    let pending: { phase: QaFlashPhase; percent: number | null } | null = null;
    let lastSentAt = 0;
    let progressTimer: NodeJS.Timeout | undefined;
    const sendProgressNow = (): void => {
      if (progressTimer) clearTimeout(progressTimer);
      progressTimer = undefined;
      if (!pending) return;
      const next = pending;
      pending = null;
      if (lastSent && lastSent.phase === next.phase && lastSent.percent === next.percent) return;
      lastSent = next;
      lastSentAt = Date.now();
      this.send({ type: "job.progress", data: { jobId, phase: next.phase, percent: next.percent } });
    };
    const reportProgress = (phase: QaFlashPhase, percent: number | null): void => {
      // Percent updates coalesce, but a phase change never swallows the previous phase's last value.
      if (pending && pending.phase !== phase) sendProgressNow();
      pending = { phase, percent };
      const wait = lastSentAt + PROGRESS_MIN_INTERVAL_MS - Date.now();
      if (wait <= 0) sendProgressNow();
      else if (!progressTimer) progressTimer = setTimeout(sendProgressNow, wait);
    };

    const finish = (ok: boolean, result: QaJobResult): void => {
      flushLog();
      if (ok) reportProgress("done", 100);
      sendProgressNow();
      this.send({ type: "job.result", data: { jobId, ok, result } });
      log.info(`Job ${jobId} finished: ${ok ? "ok" : `failed (${result.error ?? "unknown error"})`}`);
    };

    let tempFile: string | null = null;
    try {
      if (!JOB_ID_PATTERN.test(jobId)) throw new Error("Invalid job id.");
      reportProgress("connecting", null);
      const tracker = createProgressTracker();
      const onLine = (line: string): void => {
        pushLog(line);
        if (job.kind === "flash") {
          const update = tracker.update(line);
          if (update) reportProgress(update.phase, update.percent);
        }
      };

      let args: string[];
      let timeoutMs: number;
      if (job.kind === "identify") {
        args = buildIdentifyArgs(job.probeSerial, job.connectMode);
        timeoutMs = IDENTIFY_TIMEOUT_MS;
      } else if (job.kind === "flash") {
        const firmware = job.firmware;
        if (!firmware) throw new Error("Flash job has no firmware.");
        if (firmware.format !== "bin" && firmware.format !== "hex") throw new Error("Unsupported firmware format.");
        if (!Number.isInteger(firmware.sizeBytes) || firmware.sizeBytes <= 0 || firmware.sizeBytes > QA_FIRMWARE_MAX_BYTES) {
          throw new Error("Firmware size is out of range.");
        }
        if (firmware.contentBase64.length > Math.ceil(QA_FIRMWARE_MAX_BYTES / 3) * 4 + 4) {
          throw new Error("Firmware payload is too large.");
        }
        const bytes = Buffer.from(firmware.contentBase64, "base64");
        if (bytes.length !== firmware.sizeBytes) {
          throw new Error(`Firmware size mismatch: expected ${firmware.sizeBytes} bytes, received ${bytes.length}.`);
        }
        const digest = createHash("sha256").update(bytes).digest("hex");
        if (digest !== firmware.sha256.toLowerCase()) {
          throw new Error("Firmware checksum mismatch; refusing to flash.");
        }
        const dir = join(tmpdir(), "stepwhere-qa-agent");
        await mkdir(dir, { recursive: true, mode: 0o700 });
        tempFile = join(dir, `${jobId}.${firmware.format}`);
        await writeFile(tempFile, bytes, { mode: 0o600 });
        args = buildFlashArgs({
          probeSerial: job.probeSerial,
          connectMode: job.connectMode,
          filePath: tempFile,
          format: firmware.format,
          address: firmware.address,
        });
        timeoutMs = FLASH_TIMEOUT_MS;
      } else {
        throw new Error("Unsupported job kind.");
      }

      if (running.controller.signal.aborted) {
        finish(false, emptyResult(startedAt, "Cancelled from the admin panel."));
        return;
      }

      let run: ProgrammerRun;
      try {
        run = await this.runCli(args, { onLine, signal: running.controller.signal, timeoutMs, exclusive: false });
      } catch (error) {
        finish(false, emptyResult(startedAt, error instanceof Error ? error.message : String(error)));
        return;
      }

      const target: QaTargetInfo | null = parseTargetInfo(run.lines);
      const hasTarget = target.deviceId !== null || target.uid !== null || target.deviceName !== null;
      const errorLine = findErrorLine(run.lines);
      let error: string | null = null;
      if (running.cancelled || run.aborted) error = "Cancelled from the admin panel.";
      else if (run.timedOut) error = `Timed out after ${Math.round(timeoutMs / 1000)} s.`;
      else if (errorLine) error = errorLine;
      else if (run.exitCode !== 0) error = `STM32_Programmer_CLI exited with code ${String(run.exitCode)}.`;
      else if (job.kind === "identify" && !hasTarget) error = "Connected, but no target information was reported.";

      const ok = error === null;
      finish(ok, {
        target: hasTarget ? target : null,
        verified: job.kind === "flash" ? ok && sawVerified(run.lines) : null,
        durationMs: Date.now() - startedAt,
        exitCode: run.exitCode,
        error,
      });
    } catch (error) {
      finish(false, emptyResult(startedAt, error instanceof Error ? error.message : String(error)));
    } finally {
      if (progressTimer) clearTimeout(progressTimer);
      if (logTimer) clearTimeout(logTimer);
      if (tempFile) await rm(tempFile, { force: true }).catch(() => {});
    }
  }
}
