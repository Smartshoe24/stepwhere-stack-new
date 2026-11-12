import type { QaAgentToServerMessage } from "@stepwhere/types";
import type { WSContext } from "hono/ws";

import { env } from "../../config/env";
import { getSafeErrorDetails } from "../../shared/background-task";
import { abortStationRuns, handleQaTtlLines } from "../qa-units/qa-tests.service";
import { handleStationSerialLines, recordBenchJobOutcome } from "../qa-units/qa-units.service";
import { parseAgentMessage, QA_AGENT_MAX_MESSAGE_BYTES } from "./qa-agent.messages";
import { ensureSlotPortsOpen } from "./qa-slots.service";
import {
  broadcastJobProgress,
  createJobRuntime,
  flushJobLog,
  scheduleJobLogFlush,
} from "./qa-bench.job-runtime";
import {
  broadcastJobChanged,
  broadcastJobLog,
  broadcastSerialData,
  broadcastSerialError,
  broadcastStationChanged,
} from "./qa-bench.realtime";
import { qaBenchRegistry, type QaJobRuntime, type QaStationConnection } from "./qa-bench.registry";
import {
  completeJob,
  failActiveJobs,
  findActiveJobForStation,
  handleStationDisconnected,
  markJobRunning,
  persistJobPhase,
  recordAgentHello,
  touchStationLastSeen,
} from "./qa-bench.service";

export const QA_PING_INTERVAL_MS = 20_000;
export const QA_IDLE_TIMEOUT_MS = 60_000;
const LAST_SEEN_WRITE_INTERVAL_MS = 30_000;

const pingTimers = new WeakMap<WSContext, ReturnType<typeof setInterval>>();
const messageQueues = new WeakMap<WSContext, Promise<void>>();
const lastSeenWrites = new WeakMap<WSContext, number>();
const warnedInvalid = new WeakSet<WSContext>();

type AgentStation = { id: string; name: string };

export function handleAgentOpen(station: AgentStation, ws: WSContext) {
  qaBenchRegistry.register({
    ws,
    stationId: station.id,
    stationName: station.name,
    hello: null,
    hardware: null,
    serialSessions: new Map(),
    lastMessageAt: Date.now(),
  });

  qaBenchRegistry.send(station.id, {
    type: "server.welcome",
    data: { stationId: station.id, stationName: station.name },
  });

  startPing(station.id, ws);
}

export function handleAgentMessage(station: AgentStation, ws: WSContext, raw: unknown) {
  const connection = qaBenchRegistry.getByWs(station.id, ws);

  if (!connection) {
    return;
  }

  connection.lastMessageAt = Date.now();

  if (typeof raw !== "string" || raw.length > QA_AGENT_MAX_MESSAGE_BYTES) {
    return;
  }

  const message = parseAgentMessage(raw);

  if (!message) {
    if (!warnedInvalid.has(ws) && env.REALTIME_DEBUG) {
      warnedInvalid.add(ws);
      console.debug("[qa-bench] ignoring invalid agent message", { stationId: station.id });
    }

    return;
  }

  // Process in arrival order: a job.result must never overtake the job.log before it.
  const previous = messageQueues.get(ws) ?? Promise.resolve();
  const next = previous
    .then(() => processAgentMessage(station, ws, connection, message))
    .catch((error) => {
      console.error("[qa-bench] failed to process agent message", {
        type: message.type,
        ...getSafeErrorDetails(error),
      });
    });

  messageQueues.set(ws, next);
}

export async function handleAgentClosed(station: AgentStation, ws: WSContext) {
  stopPing(ws);

  // Only the current connection owns the station's jobs; a replaced one must not fail the new one's.
  if (!qaBenchRegistry.unregister(station.id, ws)) {
    return;
  }

  try {
    await (messageQueues.get(ws) ?? Promise.resolve());
    await handleStationDisconnected(station.id);
    await abortStationRuns(station.id);
  } catch (error) {
    console.error("[qa-bench] failed to clean up after agent disconnect", getSafeErrorDetails(error));
  }

  broadcastStationChanged(station.id, "disconnected");
}

function startPing(stationId: string, ws: WSContext) {
  stopPing(ws);

  const timer = setInterval(() => {
    const connection = qaBenchRegistry.getByWs(stationId, ws);

    if (!connection || ws.readyState !== 1) {
      stopPing(ws);
      return;
    }

    if (Date.now() - connection.lastMessageAt > QA_IDLE_TIMEOUT_MS) {
      stopPing(ws);

      try {
        ws.close(4003, "Agent timed out");
      } catch {
        // Already closed.
      }

      return;
    }

    qaBenchRegistry.send(stationId, { type: "server.ping", data: { sentAt: new Date().toISOString() } });
  }, QA_PING_INTERVAL_MS);

  pingTimers.set(ws, timer);
}

function stopPing(ws: WSContext) {
  const timer = pingTimers.get(ws);

  if (timer) {
    clearInterval(timer);
    pingTimers.delete(ws);
  }
}

async function resolveJob(stationId: string, jobId: string): Promise<QaJobRuntime | null> {
  const existing = qaBenchRegistry.getJob(jobId);

  if (existing) {
    return existing.stationId === stationId ? existing : null;
  }

  const found = await findActiveJobForStation(stationId, jobId);

  return found ? createJobRuntime(found.dto, found.log, found.truncated) : null;
}

async function processAgentMessage(
  station: AgentStation,
  ws: WSContext,
  connection: QaStationConnection,
  message: QaAgentToServerMessage,
) {
  // The connection may have been replaced or closed while earlier messages were processed.
  if (qaBenchRegistry.getByWs(station.id, ws) !== connection) {
    return;
  }

  switch (message.type) {
    case "agent.hello": {
      connection.hello = message.data;
      await recordAgentHello(station.id, message.data);
      await failActiveJobs(station.id, "Agent reconnected before the job finished.");
      broadcastStationChanged(station.id, "connected");
      return;
    }
    case "agent.hardware": {
      connection.hardware = message.data;
      broadcastStationChanged(station.id, "hardware");
      // A slot's adapter was plugged in (or the agent just connected): start listening to it.
      await ensureSlotPortsOpen(station.id);
      return;
    }
    case "agent.pong": {
      const now = Date.now();

      if (now - (lastSeenWrites.get(ws) ?? 0) >= LAST_SEEN_WRITE_INTERVAL_MS) {
        lastSeenWrites.set(ws, now);
        await touchStationLastSeen(station.id);
      }

      return;
    }
    case "job.accepted": {
      const runtime = await resolveJob(station.id, message.data.jobId);

      if (!runtime) {
        return;
      }

      const dto = await markJobRunning(runtime.jobId);

      if (dto) {
        runtime.dto = dto;
        broadcastJobChanged(dto);
      }

      return;
    }
    case "job.progress": {
      const runtime = await resolveJob(station.id, message.data.jobId);

      if (!runtime) {
        return;
      }

      const percent = message.data.percent === null ? null : Math.round(message.data.percent);
      const phaseChanged = runtime.phase !== message.data.phase;

      runtime.phase = message.data.phase;
      runtime.percent = percent;

      if (phaseChanged) {
        await persistJobPhase(runtime.jobId, message.data.phase, percent);
      }

      broadcastJobProgress(runtime, phaseChanged);
      return;
    }
    case "job.log": {
      const runtime = await resolveJob(station.id, message.data.jobId);

      if (!runtime || message.data.lines.length === 0) {
        return;
      }

      const lines = message.data.lines.map((line) => line.replace(/[\r\n]+/g, " "));

      broadcastJobLog(station.id, runtime.jobId, lines);

      if (!runtime.logTruncated) {
        runtime.unflushedLines.push(...lines);
        scheduleJobLogFlush(runtime);
      }

      return;
    }
    case "job.result": {
      const runtime = await resolveJob(station.id, message.data.jobId);

      if (!runtime) {
        return;
      }

      await flushJobLog(runtime);

      const { ok, result } = message.data;
      const cancelled = !ok && qaBenchRegistry.isCancelRequested(runtime.jobId);
      const dto = await completeJob(runtime.jobId, {
        status: ok ? "succeeded" : cancelled ? "cancelled" : "failed",
        result,
        phase: ok ? "done" : null,
        percent: ok ? 100 : null,
      });

      qaBenchRegistry.forgetJob(runtime.jobId);

      if (dto) {
        try {
          dto.unitId = await recordBenchJobOutcome(dto);
        } catch (error) {
          console.error("[qa-bench] failed to record the job on its unit", getSafeErrorDetails(error));
        }

        broadcastJobChanged(dto);
      }

      return;
    }
    case "serial.opened": {
      connection.serialSessions.set(message.data.path, {
        baudRate: message.data.baudRate,
        openedAt: new Date().toISOString(),
      });
      broadcastStationChanged(station.id, "serial");
      return;
    }
    case "serial.closed": {
      connection.serialSessions.delete(message.data.path);
      broadcastStationChanged(station.id, "serial");
      return;
    }
    case "serial.data": {
      if (message.data.lines.length === 0) {
        return;
      }

      const lines = qaBenchRegistry.appendSerialLines(station.id, message.data.path, message.data.lines);

      broadcastSerialData(station.id, message.data.path, lines);

      try {
        await handleStationSerialLines(station.id, message.data.path, lines, connection.serialSessions.size);
        await handleQaTtlLines(station.id, message.data.path, lines);
      } catch (error) {
        console.error("[qa-bench] failed to read unit details from serial output", getSafeErrorDetails(error));
      }

      return;
    }
    case "serial.error": {
      broadcastSerialError(station.id, message.data.path, message.data.message);
      return;
    }
  }
}
