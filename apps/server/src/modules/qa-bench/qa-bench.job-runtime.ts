import { eq, sql } from "drizzle-orm";
import type { QaBenchJobDto } from "@stepwhere/types";

import { db } from "../../db/client";
import { qaBenchJobs } from "../../db/schema";
import { getSafeErrorDetails } from "../../shared/background-task";
import { JOB_LOG_MAX_CHARS, appendCappedLog } from "./qa-bench.helpers";
import { broadcastJobChanged } from "./qa-bench.realtime";
import { qaBenchRegistry, type QaJobRuntime } from "./qa-bench.registry";

export const LOG_FLUSH_INTERVAL_MS = 1000;
export const PROGRESS_BROADCAST_INTERVAL_MS = 250;

export function createJobRuntime(dto: QaBenchJobDto, storedLog: string, logTruncated: boolean): QaJobRuntime {
  const runtime: QaJobRuntime = {
    jobId: dto.id,
    stationId: dto.stationId,
    dto,
    phase: dto.phase,
    percent: dto.percent,
    lastProgressBroadcastAt: 0,
    progressTimer: null,
    unflushedLines: [],
    lastLogFlushAt: 0,
    logTimer: null,
    storedLog,
    logTruncated,
    flushChain: Promise.resolve(),
  };

  qaBenchRegistry.setJob(runtime);

  return runtime;
}

/** Queues a write of the buffered log lines to the database. Resolves when it has been written. */
export function flushJobLog(runtime: QaJobRuntime): Promise<void> {
  if (runtime.logTimer) {
    clearTimeout(runtime.logTimer);
    runtime.logTimer = null;
  }

  runtime.flushChain = runtime.flushChain.then(async () => {
    const count = runtime.unflushedLines.length;

    if (count === 0) {
      return;
    }

    const text = `${runtime.unflushedLines.slice(0, count).join("\n")}\n`;
    const next = appendCappedLog(
      { log: runtime.storedLog, truncated: runtime.logTruncated },
      text,
      JOB_LOG_MAX_CHARS,
    );
    const delta = next.log.slice(runtime.storedLog.length);

    runtime.lastLogFlushAt = Date.now();

    try {
      if (delta.length > 0 || next.truncated !== runtime.logTruncated) {
        await db
          .update(qaBenchJobs)
          .set({
            log: sql`${qaBenchJobs.log} || ${delta}::text`,
            logTruncated: next.truncated,
          })
          .where(eq(qaBenchJobs.id, runtime.jobId));
      }

      runtime.storedLog = next.log;
      runtime.logTruncated = next.truncated;
      runtime.unflushedLines.splice(0, count);
    } catch (error) {
      console.error("[qa-bench] failed to flush job log", getSafeErrorDetails(error));
    }

    if (runtime.logTruncated) {
      runtime.unflushedLines.length = 0;
    }
  });

  return runtime.flushChain;
}

/** Flushes at most once per second: immediately if the last flush is old enough, else on a timer. */
export function scheduleJobLogFlush(runtime: QaJobRuntime) {
  if (runtime.logTimer) {
    return;
  }

  const wait = Math.max(0, LOG_FLUSH_INTERVAL_MS - (Date.now() - runtime.lastLogFlushAt));

  runtime.logTimer = setTimeout(() => {
    runtime.logTimer = null;
    void flushJobLog(runtime);
  }, wait);
}

/** Broadcasts the job with the latest in-memory phase/percent, at most every 250 ms unless forced. */
export function broadcastJobProgress(runtime: QaJobRuntime, force: boolean) {
  const send = () => {
    runtime.progressTimer = null;
    runtime.lastProgressBroadcastAt = Date.now();
    broadcastJobChanged({
      ...runtime.dto,
      phase: runtime.phase as QaBenchJobDto["phase"],
      percent: runtime.percent,
    });
  };

  if (force) {
    if (runtime.progressTimer) {
      clearTimeout(runtime.progressTimer);
    }

    send();
    return;
  }

  if (runtime.progressTimer) {
    return;
  }

  const wait = PROGRESS_BROADCAST_INTERVAL_MS - (Date.now() - runtime.lastProgressBroadcastAt);

  if (wait <= 0) {
    send();
    return;
  }

  runtime.progressTimer = setTimeout(send, wait);
}
