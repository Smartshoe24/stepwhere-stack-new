import type { QaAgentToServerMessage, QaHardwareSnapshot, QaProbe, QaSerialPortInfo } from "@stepwhere/types";
import * as log from "./log.js";
import { isProgrammerBusy, resolveProgrammerPath, scanProbes } from "./programmer.js";
import { listPorts } from "./serial.js";

export const PORT_SCAN_INTERVAL_MS = 5_000;
export const PROBE_SCAN_INTERVAL_MS = 15_000;

type Send = (message: QaAgentToServerMessage) => boolean;

/** Snapshot identity ignoring `scannedAt`. */
export function snapshotSignature(snapshot: Pick<QaHardwareSnapshot, "probes" | "ports" | "probeScanError">): string {
  return JSON.stringify([snapshot.probes, snapshot.ports, snapshot.probeScanError]);
}

export class HardwareMonitor {
  private probes: QaProbe[] = [];
  private ports: QaSerialPortInfo[] = [];
  private probeScanError: string | null = null;
  private lastProbeScanAt = 0;
  private lastSentSignature: string | null = null;
  private timer: NodeJS.Timeout | undefined;
  private chain: Promise<void> = Promise.resolve();
  private inFlight = 0;
  private stopped = false;

  constructor(
    private readonly send: Send,
    private readonly isJobRunning: () => boolean,
  ) {}

  start(): void {
    this.stopped = false;
    void this.scan({ forceProbes: false });
    this.timer = setInterval(() => void this.scan({ forceProbes: false }), PORT_SCAN_INTERVAL_MS);
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  /** Forces a fresh scan of ports and probes and always sends the result (server asked, or we just connected). */
  async scanAndSend(): Promise<void> {
    await this.scan({ forceProbes: true, forceSend: true });
  }

  /** Marks the server as not having a snapshot (e.g. after a reconnect). */
  resetSent(): void {
    this.lastSentSignature = null;
  }

  private scan(options: { forceProbes: boolean; forceSend?: boolean }): Promise<void> {
    // Periodic ticks are skipped while a scan is in flight; forced scans queue behind it.
    if (!options.forceProbes && this.inFlight > 0) return Promise.resolve();
    this.inFlight += 1;
    const run = this.chain
      .then(() => this.doScan(options))
      .catch((error) => log.warn(`Hardware scan failed: ${error instanceof Error ? error.message : String(error)}`))
      .finally(() => {
        this.inFlight -= 1;
      });
    this.chain = run;
    return run;
  }

  private async doScan(options: { forceProbes: boolean; forceSend?: boolean }): Promise<void> {
    try {
      this.ports = await listPorts();
    } catch (error) {
      log.warn(`Serial port scan failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    const due = Date.now() - this.lastProbeScanAt >= PROBE_SCAN_INTERVAL_MS - 500;
    if (options.forceProbes || due) {
      const programmer = resolveProgrammerPath();
      if (!programmer.ok) {
        this.probes = [];
        this.probeScanError = programmer.error;
        this.lastProbeScanAt = Date.now();
      } else if (!this.isJobRunning() && !isProgrammerBusy()) {
        const result = await scanProbes();
        this.probes = result.probes;
        this.probeScanError = result.error;
        this.lastProbeScanAt = Date.now();
      }
      // While a job runs the last known probes are kept rather than blocking behind the flash.
    }

    if (this.stopped) return;
    const snapshot = this.snapshot();
    const signature = snapshotSignature(snapshot);
    if (options.forceSend || signature !== this.lastSentSignature) {
      if (this.send({ type: "agent.hardware", data: snapshot })) this.lastSentSignature = signature;
    }
  }

  snapshot(): QaHardwareSnapshot {
    return {
      probes: this.probes,
      ports: this.ports,
      scannedAt: new Date().toISOString(),
      probeScanError: this.probeScanError,
    };
  }
}
