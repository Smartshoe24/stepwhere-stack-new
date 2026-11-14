import type { QaAgentHello, QaBenchJobDto, QaHardwareSnapshot, QaSerialLine, QaServerToAgentMessage } from "@stepwhere/types";
import type { WSContext } from "hono/ws";

import { appendRingLines, capSerialLines, serialBufferKey } from "./qa-bench.helpers";

export type QaSerialSession = { baudRate: number; openedAt: string };

export type QaStationConnection = {
  ws: WSContext;
  stationId: string;
  stationName: string;
  hello: QaAgentHello | null;
  hardware: QaHardwareSnapshot | null;
  serialSessions: Map<string, QaSerialSession>;
  lastMessageAt: number;
};

/** In-memory state for a job the agent is working on. Never persisted as-is. */
export type QaJobRuntime = {
  jobId: string;
  stationId: string;
  dto: QaBenchJobDto;
  phase: string | null;
  percent: number | null;
  lastProgressBroadcastAt: number;
  progressTimer: ReturnType<typeof setTimeout> | null;
  /** Lines received but not yet flushed to the database (served by the log endpoint). */
  unflushedLines: string[];
  lastLogFlushAt: number;
  logTimer: ReturnType<typeof setTimeout> | null;
  storedLog: string;
  logTruncated: boolean;
  flushChain: Promise<void>;
};

const REPLACED_CLOSE_CODE = 4000;

class QaBenchRegistry {
  private readonly connections = new Map<string, QaStationConnection>();
  private readonly serialBuffers = new Map<string, QaSerialLine[]>();
  private readonly lastLineAt = new Map<string, string>();
  private readonly cancelRequested = new Set<string>();
  private readonly jobs = new Map<string, QaJobRuntime>();

  register(connection: QaStationConnection) {
    const existing = this.connections.get(connection.stationId);

    this.connections.set(connection.stationId, connection);

    if (existing && existing.ws !== connection.ws) {
      this.closeQuietly(existing.ws, REPLACED_CLOSE_CODE, "Replaced by a newer connection");
    }
  }

  /** Returns true when `ws` was the registered connection (and is now removed). */
  unregister(stationId: string, ws: WSContext) {
    const existing = this.connections.get(stationId);

    if (!existing || existing.ws !== ws) {
      return false;
    }

    this.connections.delete(stationId);

    return true;
  }

  get(stationId: string) {
    return this.connections.get(stationId) ?? null;
  }

  /** Stations whose agent is connected right now. */
  onlineStationIds() {
    return [...this.connections.keys()];
  }

  isOnline(stationId: string) {
    return this.connections.has(stationId);
  }

  getByWs(stationId: string, ws: WSContext) {
    const existing = this.connections.get(stationId);

    return existing && existing.ws === ws ? existing : null;
  }

  send(stationId: string, message: QaServerToAgentMessage) {
    const connection = this.connections.get(stationId);

    if (!connection || connection.ws.readyState !== 1) {
      return false;
    }

    try {
      connection.ws.send(JSON.stringify(message));
      return true;
    } catch {
      return false;
    }
  }

  /** Closes and forgets the station's live connection. Returns true if there was one. */
  disconnect(stationId: string, code: number, reason: string) {
    const existing = this.connections.get(stationId);

    if (!existing) {
      return false;
    }

    this.connections.delete(stationId);
    this.closeQuietly(existing.ws, code, reason);

    return true;
  }

  // Serial ring buffers -----------------------------------------------------

  appendSerialLines(stationId: string, path: string, lines: QaSerialLine[]) {
    const key = serialBufferKey(stationId, path);
    const capped = capSerialLines(lines);

    this.serialBuffers.set(key, appendRingLines(this.serialBuffers.get(key) ?? [], capped));
    this.lastLineAt.set(key, new Date().toISOString());

    return capped;
  }

  /** When the agent last forwarded a line from this port. */
  getLastLineAt(stationId: string, path: string) {
    return this.lastLineAt.get(serialBufferKey(stationId, path)) ?? null;
  }

  getSerialLines(stationId: string, path: string) {
    return this.serialBuffers.get(serialBufferKey(stationId, path)) ?? [];
  }

  clearSerialBuffers(stationId: string) {
    const prefix = `${stationId}\u0000`;

    for (const key of this.serialBuffers.keys()) {
      if (key.startsWith(prefix)) {
        this.serialBuffers.delete(key);
      }
    }

    for (const key of this.lastLineAt.keys()) {
      if (key.startsWith(prefix)) {
        this.lastLineAt.delete(key);
      }
    }
  }

  // Jobs --------------------------------------------------------------------

  markCancelRequested(jobId: string) {
    this.cancelRequested.add(jobId);
  }

  isCancelRequested(jobId: string) {
    return this.cancelRequested.has(jobId);
  }

  getJob(jobId: string) {
    return this.jobs.get(jobId) ?? null;
  }

  setJob(runtime: QaJobRuntime) {
    this.jobs.set(runtime.jobId, runtime);
  }

  jobsForStation(stationId: string) {
    return [...this.jobs.values()].filter((job) => job.stationId === stationId);
  }

  forgetJob(jobId: string) {
    const runtime = this.jobs.get(jobId);

    if (runtime?.progressTimer) {
      clearTimeout(runtime.progressTimer);
    }

    if (runtime?.logTimer) {
      clearTimeout(runtime.logTimer);
    }

    this.jobs.delete(jobId);
    this.cancelRequested.delete(jobId);
  }

  private closeQuietly(ws: WSContext, code: number, reason: string) {
    try {
      ws.close(code, reason);
    } catch {
      // Already closed.
    }
  }
}

export const qaBenchRegistry = new QaBenchRegistry();
