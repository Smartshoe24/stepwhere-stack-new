import { and, asc, eq, inArray, lt, lte } from "drizzle-orm";

import { db } from "../../db/client";
import { historyEnrichmentJobs } from "../../db/schema";
import { enrichHistoryPlace } from "./history-place.service";
import { enrichHistoryRoadGeometry } from "./history-roads.service";

function nextAttemptAt(attemptCount: number) {
  return new Date(Date.now() + Math.min(30 * 60_000, 60_000 * 2 ** Math.max(0, attemptCount - 1)));
}

export async function processPendingHistoryEnrichmentJobs(limit = 25) {
  const now = new Date();

  const jobs = await db
    .select()
    .from(historyEnrichmentJobs)
    .where(and(
      inArray(historyEnrichmentJobs.status, ["pending", "failed"]),
      lte(historyEnrichmentJobs.nextAttemptAt, now),
    ))
    .orderBy(asc(historyEnrichmentJobs.nextAttemptAt), asc(historyEnrichmentJobs.createdAt))
    .limit(limit);

  for (const job of jobs) {
    const [claimed] = await db
      .update(historyEnrichmentJobs)
      .set({
        status: "processing",
        leaseExpiresAt: new Date(Date.now() + 30_000),
        updatedAt: new Date(),
      })
      .where(and(
        eq(historyEnrichmentJobs.id, job.id),
        inArray(historyEnrichmentJobs.status, ["pending", "failed"]),
        lte(historyEnrichmentJobs.nextAttemptAt, new Date()),
      ))
      .returning({ id: historyEnrichmentJobs.id });

    if (!claimed) {
      continue;
    }

    const result = job.type === "place"
      ? await enrichHistoryPlace(job.historyEventId)
      : await enrichHistoryRoadGeometry(job.historyEventId);
    const nextAttemptCount = job.attemptCount + 1;

    if (result.status === "completed" || result.status === "rejected") {
      await db
        .update(historyEnrichmentJobs)
        .set({
          status: result.status,
          attemptCount: nextAttemptCount,
          lastError: "error" in result ? result.error : null,
          leaseExpiresAt: null,
          updatedAt: new Date(),
        })
        .where(eq(historyEnrichmentJobs.id, job.id));
      continue;
    }

    await db
      .update(historyEnrichmentJobs)
      .set({
        status: nextAttemptCount >= 5 ? "failed" : "pending",
        attemptCount: nextAttemptCount,
        nextAttemptAt: nextAttemptAt(nextAttemptCount),
        lastError: result.error,
        leaseExpiresAt: null,
        updatedAt: new Date(),
      })
      .where(eq(historyEnrichmentJobs.id, job.id));
  }
}

export async function recoverExpiredHistoryEnrichmentLeases() {
  const now = new Date();

  await db
    .update(historyEnrichmentJobs)
    .set({
      status: "pending",
      leaseExpiresAt: null,
      nextAttemptAt: now,
      lastError: "Recovered after an expired processing lease.",
      updatedAt: now,
    })
    .where(and(
      eq(historyEnrichmentJobs.status, "processing"),
      lt(historyEnrichmentJobs.leaseExpiresAt, now),
    ));
}
