import { and, desc, eq, inArray } from "drizzle-orm";
import type { QaStationTestRunDto, QaTestRunDto } from "@stepwhere/types";

import { db } from "../../db/client";
import { qaStations, qaTestRuns } from "../../db/schema";
import { combineBoardTestRuns } from "./qa-tests.helpers";

type RunRow = typeof qaTestRuns.$inferSelect;

function selectRuns() {
  return db
    .select({ run: qaTestRuns, stationName: qaStations.name })
    .from(qaTestRuns)
    .leftJoin(qaStations, eq(qaStations.id, qaTestRuns.stationId));
}

export function toRunDto(run: RunRow, stationName: string | null): QaTestRunDto {
  return {
    id: run.id,
    unitId: run.unitId,
    stationId: run.stationId,
    stationName,
    serialPath: run.serialPath,
    slotId: run.slotId,
    chipUid: run.chipUid,
    firmwareVersion: run.firmwareVersion,
    runNumber: run.runNumber,
    status: run.status,
    // Runs recorded before the Start prompt existed have no `awaiting`.
    results: run.results.map((entry) => ({ ...entry, awaiting: entry.awaiting ?? null })),
    passed: run.passed,
    failed: run.failed,
    skipped: run.skipped,
    startedAt: run.startedAt.toISOString(),
    finishedAt: run.finishedAt?.toISOString() ?? null,
  };
}

export async function loadRunDto(runId: string) {
  const [row] = await selectRuns().where(eq(qaTestRuns.id, runId)).limit(1);

  return row ? toRunDto(row.run, row.stationName) : null;
}

export async function listTestRunsForUnit(unitId: string, limit: number) {
  const rows = await selectRuns()
    .where(eq(qaTestRuns.unitId, unitId))
    .orderBy(desc(qaTestRuns.startedAt))
    .limit(limit);

  return rows.map((row) => toRunDto(row.run, row.stationName));
}

/** Finished runs of a unit, newest first, enough to reach its last full run. */
export async function listFinishedUnitRuns(unitId: string) {
  return db
    .select({ results: qaTestRuns.results })
    .from(qaTestRuns)
    .where(and(eq(qaTestRuns.unitId, unitId), inArray(qaTestRuns.status, ["passed", "failed"])))
    .orderBy(desc(qaTestRuns.startedAt))
    .limit(50);
}

export async function getLatestStationRun(stationId: string): Promise<QaStationTestRunDto> {
  const [row] = await selectRuns()
    .where(eq(qaTestRuns.stationId, stationId))
    .orderBy(desc(qaTestRuns.startedAt))
    .limit(1);

  if (!row) {
    return { run: null, verdict: null };
  }

  const verdict = row.run.unitId ? combineBoardTestRuns(await listFinishedUnitRuns(row.run.unitId)) : null;

  return {
    run: toRunDto(row.run, row.stationName),
    verdict: verdict ? { status: verdict.status, failing: verdict.failing, untested: verdict.untested } : null,
  };
}
