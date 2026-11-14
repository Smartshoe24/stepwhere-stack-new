import { and, desc, eq, or } from "drizzle-orm";
import { QA_BOARD_TEST_IDS, QA_BOARD_TESTS } from "@stepwhere/types";
import type { QaBoardTestId, QaSerialLine, QaTtlMessage } from "@stepwhere/types";

import { db } from "../../db/client";
import { qaTestRuns, qaUnits } from "../../db/schema";
import { handleRunFinished } from "../qa-bench/qa-automation.service";
import { findSlotIdForPort } from "../qa-bench/qa-slots.service";
import { getSafeErrorDetails } from "../../shared/background-task";
import { applyTtlMessage, combineBoardTestRuns, countResults, emptyResults, parseQaTtlLine } from "./qa-tests.helpers";
import { listFinishedUnitRuns, loadRunDto } from "./qa-test-runs.query";
import { broadcastTestRunChanged, broadcastUnitChanged } from "./qa-units.realtime";
import { normalizeImei } from "./qa-units.helpers";
import { addEvent, linkImeiReportedByBoard, upsertUnitByChip } from "./qa-units.service";

type RunRow = typeof qaTestRuns.$inferSelect;

async function publishRun(runId: string) {
  const dto = await loadRunDto(runId);

  if (dto) {
    broadcastTestRunChanged(dto);
  }

  return dto;
}

async function abortRuns(where: ReturnType<typeof and>) {
  const rows = await db
    .update(qaTestRuns)
    .set({ status: "aborted", finishedAt: new Date() })
    .where(and(eq(qaTestRuns.status, "running"), where))
    .returning({ id: qaTestRuns.id });

  for (const row of rows) {
    await publishRun(row.id);
  }
}

/** Marks a station's unfinished runs aborted, e.g. when its agent disconnects. */
export async function abortStationRuns(stationId: string) {
  await abortRuns(eq(qaTestRuns.stationId, stationId));
}

/**
 * A board on this port rebooted or started over, so the run read from the port ends. Other ports
 * on the station keep running: a bench may test 30 boards at once.
 */
async function abortPortRuns(stationId: string, path: string, chipUid: string | null) {
  const onPort = and(eq(qaTestRuns.stationId, stationId), eq(qaTestRuns.serialPath, path));

  // The same board can't be running anywhere else either; it was moved to this port.
  await abortRuns(chipUid ? or(onPort, eq(qaTestRuns.chipUid, chipUid)) : onPort);
}

async function findActiveRun(stationId: string, path: string, chipUid: string, runNumber: number) {
  const [row] = await db
    .select()
    .from(qaTestRuns)
    .where(and(
      eq(qaTestRuns.stationId, stationId),
      eq(qaTestRuns.serialPath, path),
      eq(qaTestRuns.status, "running"),
      eq(qaTestRuns.chipUid, chipUid),
      eq(qaTestRuns.runNumber, runNumber),
    ))
    .orderBy(desc(qaTestRuns.startedAt))
    .limit(1);

  return row ?? null;
}

type Port = { stationId: string; path: string };

async function startRun({ stationId, path }: Port, chipUid: string, runNumber: number, firmwareVersion: string, tests: readonly (typeof QA_BOARD_TEST_IDS)[number][]) {
  await abortPortRuns(stationId, path, chipUid);

  const unit = await db.transaction((tx) => upsertUnitByChip(tx, chipUid, stationId, null));

  await db.update(qaUnits).set({ lastStationId: stationId, updatedAt: new Date() }).where(eq(qaUnits.id, unit.id));

  const [run] = await db
    .insert(qaTestRuns)
    .values({
      unitId: unit.id,
      stationId,
      serialPath: path,
      slotId: await findSlotIdForPort(stationId, path),
      chipUid,
      firmwareVersion,
      runNumber,
      results: emptyResults(tests),
    })
    .returning();

  broadcastUnitChanged(unit.id, stationId);

  return run;
}

/** Records the finished run on its unit: Board tests passed or failed, plus a timeline entry. */
async function finishRun(run: RunRow, stationId: string) {
  const counts = countResults(run.results);
  const status = counts.failed > 0 ? "failed" : "passed";
  const now = new Date();

  await db
    .update(qaTestRuns)
    .set({ status, ...counts, finishedAt: now })
    .where(eq(qaTestRuns.id, run.id));

  if (!run.unitId) {
    return;
  }

  const [unit] = await db.select().from(qaUnits).where(eq(qaUnits.id, run.unitId)).limit(1);

  if (!unit) {
    return;
  }

  // The verdict combines this run with earlier ones, so retrying one test cannot hide another failure.
  const history = await listFinishedUnitRuns(unit.id);
  const verdict = combineBoardTestRuns(history);
  const labels = (ids: QaBoardTestId[]) => ids.map((id) => QA_BOARD_TESTS[id].label).join(", ");
  const retried = run.results.length < QA_BOARD_TEST_IDS.length
    ? `Retested ${labels(run.results.map((entry) => entry.id))}: ${counts.passed} passed, ${counts.failed} failed. `
    : `Ran all board tests: ${counts.passed}/${run.results.length} passed. `;
  const summary = verdict.status === "passed"
    ? `${retried}Board tests passed on ${run.firmwareVersion}.`
    : verdict.status === "failed"
      ? `${retried}Board tests failed: ${labels(verdict.failing)}.`
      : `${retried}Still to test: ${labels(verdict.untested)}.`;
  const scrapped = unit.stageStatus === "scrapped";

  await db.transaction(async (tx) => {
    await tx
      .update(qaUnits)
      .set({
        updatedAt: now,
        ...(scrapped ? {} : { stage: "board_tests" as const, stageStatus: verdict.status, stageChangedAt: now }),
      })
      .where(eq(qaUnits.id, unit.id));
    await addEvent(tx, {
      unitId: unit.id,
      kind: "test_run",
      message: summary,
      stage: scrapped ? null : "board_tests",
      stageStatus: scrapped ? null : verdict.status,
      data: {
        runId: run.id,
        ...counts,
        failing: verdict.failing,
        untested: verdict.untested,
        firmwareVersion: run.firmwareVersion,
      },
      stationId,
    });
  });

  broadcastUnitChanged(unit.id, stationId);

  if (!scrapped) {
    await handleRunFinished({
      stationId,
      slotId: run.slotId,
      unitId: unit.id,
      chipUid: unit.chipUid,
      verdict: { status: verdict.status, failing: verdict.failing, untested: verdict.untested },
    }).catch((error) => console.error("[qa-tests] automation failed after a run", getSafeErrorDetails(error)));
  }
}

async function handleMessage(port: Port, message: QaTtlMessage, at: Date) {
  const { stationId } = port;

  if (message.e === "boot") {
    // A reboot ends whatever was running on this port.
    await abortPortRuns(stationId, port.path, message.uid);
    return;
  }

  if (message.e === "run") {
    const run = await startRun(port, message.uid, message.run, message.fw, message.tests);
    await publishRun(run.id);
    return;
  }

  // A console opened mid-run still records the rest of it.
  const run = await findActiveRun(stationId, port.path, message.uid, message.run)
    ?? await startRun(port, message.uid, message.run, "unknown", QA_BOARD_TEST_IDS);

  if (message.e === "done") {
    await finishRun(run, stationId);
    await publishRun(run.id);
    return;
  }

  const results = applyTtlMessage(run.results, message, at);

  await db.update(qaTestRuns).set({ results, ...countResults(results) }).where(eq(qaTestRuns.id, run.id));

  // The modem test reports the IMEI; linking it here needs no "[IMEI]" boot line or recent bench job.
  if (message.e === "test" && run.unitId) {
    const imei = normalizeImei(typeof message.data?.imei === "string" ? message.data.imei : null);

    if (imei) {
      await linkImeiReportedByBoard(run.unitId, imei, stationId);
    }
  }

  await publishRun(run.id);
}

/** Picks the QA firmware's `@QA {…}` lines out of one TTL port's output. */
export async function handleQaTtlLines(stationId: string, path: string, lines: QaSerialLine[]) {
  for (const line of lines) {
    const message = parseQaTtlLine(line.text);

    if (message) {
      const at = new Date(line.at);
      await handleMessage({ stationId, path }, message, Number.isNaN(at.getTime()) ? new Date() : at);
    }
  }
}
