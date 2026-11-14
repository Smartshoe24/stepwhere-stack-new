/**
 * Bench automation. With it on for a station, nobody clicks per board:
 *
 * 1. Every idle slot with its own ST-LINK is checked every few seconds with an
 *    identify job in hot-plug mode (no reset, no halt), so a board is found as
 *    soon as it is clipped in.
 * 2. A new board gets the newest QA firmware. Its tests start at boot; if no
 *    results arrive, it is asked once with QA RUN, then flashed once more.
 * 3. A failed network test (SIM, GSM, Wi-Fi, cell, data) is retried once.
 * 4. A board that passed every board test gets the newest production firmware,
 *    which must be the combined .hex (OTA bootloader + app).
 * 5. Anything that needs a person is pushed to every open admin as an alert.
 *
 * Every action is taken at most once per board and stage (decideSlotAction),
 * so nothing is flashed or tested in a loop. State is in memory: after a server
 * restart a board may be identified again, which is harmless.
 */
import { and, desc, eq, gte } from "drizzle-orm";
import { QA_BOARD_TESTS, QA_DEFAULT_FLASH_ADDRESS } from "@stepwhere/types";
import type { QaAttentionDto, QaBenchJobDto, QaBoardTestId } from "@stepwhere/types";

import { db } from "../../db/client";
import { qaBenchJobs, qaFirmwareUploads, qaStationSlots, qaStations, qaTestRuns, qaUnits } from "../../db/schema";
import { getSafeErrorDetails } from "../../shared/background-task";
import { normalizeChipUid } from "../qa-units/qa-units.helpers";
import { decideSlotAction, pickRetry, slotIsIdle } from "./qa-automation.helpers";
import { broadcastAttention, broadcastStationChanged } from "./qa-bench.realtime";
import { qaBenchRegistry } from "./qa-bench.registry";
import { createJob } from "./qa-bench.service";
import { getStationSlots, sendSlotCommand } from "./qa-slots.service";

const TICK_MS = 5_000;
/** How often an idle slot is checked for a board. */
const PROBE_INTERVAL_MS = 15_000;
/** A slot whose board printed something this recently is busy, not idle. */
const QUIET_MS = 20_000;
/** After a QA flash, how long to wait for the board's test results before asking for them. */
const SAFETY_NET_DELAY_MS = 30_000;
/** Remembered actions are forgotten after this long, so memory stays small on a busy bench. */
const DONE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Identify jobs started by automation: their outcome is not recorded on the unit. */
const probeJobs = new Map<string, { stationId: string; slotId: string }>();
const lastProbeAt = new Map<string, number>();
/** Action keys already taken (see decideSlotAction), with when. */
const doneAt = new Map<string, number>();
/** Network tests already retried, per unit, since its last QA flash. */
const retried = new Map<string, Set<QaBoardTestId>>();
const ticking = new Set<string>();
let timer: ReturnType<typeof setInterval> | null = null;

function doneKeys() {
  const now = Date.now();

  for (const [key, at] of doneAt) {
    if (now - at > DONE_TTL_MS) doneAt.delete(key);
  }

  return new Set(doneAt.keys());
}

function logError(what: string, error: unknown) {
  console.error(`[qa-automation] ${what}`, getSafeErrorDetails(error));
}

/** Starts the automation loop once; it does nothing for stations with automation off. */
export function startQaAutomation() {
  if (timer) {
    return;
  }

  timer = setInterval(() => {
    for (const stationId of qaBenchRegistry.onlineStationIds()) {
      if (ticking.has(stationId)) continue;

      ticking.add(stationId);
      void tickStation(stationId)
        .catch((error) => logError("tick failed", error))
        .finally(() => ticking.delete(stationId));
    }
  }, TICK_MS);
  timer.unref?.();
}

async function automationEnabled(stationId: string) {
  const [row] = await db
    .select({ enabled: qaStations.automationEnabled })
    .from(qaStations)
    .where(eq(qaStations.id, stationId))
    .limit(1);

  return row?.enabled ?? false;
}

async function slotLabel(slotId: string | null) {
  if (!slotId) {
    return null;
  }

  const [row] = await db
    .select({ label: qaStationSlots.label, position: qaStationSlots.position })
    .from(qaStationSlots)
    .where(eq(qaStationSlots.id, slotId))
    .limit(1);

  return row ? row.label ?? `Slot ${row.position}` : null;
}

async function attention(input: Omit<QaAttentionDto, "slotLabel">) {
  broadcastAttention({ ...input, slotLabel: await slotLabel(input.slotId) });
}

/** The newest QA upload and the newest production upload. */
async function currentFirmware() {
  const rows = await db
    .select({ id: qaFirmwareUploads.id, format: qaFirmwareUploads.format, channel: qaFirmwareUploads.channel })
    .from(qaFirmwareUploads)
    .orderBy(desc(qaFirmwareUploads.createdAt))
    .limit(50);
  const qa = rows.find((row) => row.channel === "qa");
  const production = rows.find((row) => row.channel === "production");

  return {
    qa: qa ? { id: qa.id, format: qa.format } : null,
    production: production ? { id: production.id, format: production.format } : null,
  };
}

/** Starts an identify job on every idle slot that has its own ST-LINK and is due for a check. */
async function tickStation(stationId: string) {
  if (!(await automationEnabled(stationId)) || !qaBenchRegistry.get(stationId)?.hardware) {
    return;
  }

  const { slots } = await getStationSlots(stationId);
  const now = Date.now();

  for (const slot of slots) {
    // A shared ST-LINK is clipped from board to board by hand; automation can't know which one it is on.
    if (!slot.probeSerial || !slot.probePresent || slot.probeShared) continue;

    const idle = slotIsIdle({
      hasActiveJob: !!slot.activeJob,
      runRunning: slot.run?.status === "running",
      lastLineAt: slot.lastLineAt,
      now,
      quietMs: QUIET_MS,
    });

    if (!idle || now - (lastProbeAt.get(slot.id) ?? 0) < PROBE_INTERVAL_MS) continue;

    lastProbeAt.set(slot.id, now);

    try {
      // Hot plug: read the chip UID without resetting or halting whatever the board is running.
      const job = await createJob(stationId, { kind: "identify", probeSerial: slot.probeSerial, connectMode: "hotPlug", slotId: slot.id }, null);

      probeJobs.set(job.id, { stationId, slotId: slot.id });
    } catch {
      // The ST-LINK is busy or the station went offline; the next tick tries again.
    }
  }
}

/** Looks up the board's unit and takes the next step for it, if any. Returns what it decided. */
async function actOnBoard(stationId: string, slotId: string, chipUid: string) {
  const { slots } = await getStationSlots(stationId);
  const slot = slots.find((entry) => entry.id === slotId);

  if (!slot?.probeSerial || slot.probeShared) {
    return { kind: "none" as const, reason: "The slot has no ST-LINK of its own" };
  }

  const [unit] = await db
    .select({ id: qaUnits.id, stage: qaUnits.stage, stageStatus: qaUnits.stageStatus, stageChangedAt: qaUnits.stageChangedAt })
    .from(qaUnits)
    .where(eq(qaUnits.chipUid, chipUid))
    .limit(1);
  let hasRun = false;

  if (unit) {
    const [run] = await db
      .select({ id: qaTestRuns.id })
      .from(qaTestRuns)
      .where(and(eq(qaTestRuns.unitId, unit.id), gte(qaTestRuns.startedAt, unit.stageChangedAt)))
      .limit(1);

    hasRun = !!run;
  }

  const action = decideSlotAction(
    {
      chipUid,
      unit: unit ? { stage: unit.stage, stageStatus: unit.stageStatus, stageChangedAt: unit.stageChangedAt } : null,
      hasRunSinceStageChange: hasRun,
      portOpen: slot.portOpen,
    },
    await currentFirmware(),
    doneKeys(),
  );

  if (action.kind === "none") {
    return action;
  }

  doneAt.set(action.key, Date.now());

  if (action.kind === "run_tests") {
    await sendSlotCommand(stationId, [slotId], "QA RUN\r\n");
    return action;
  }

  try {
    await createJob(
      stationId,
      {
        kind: "flash",
        probeSerial: slot.probeSerial,
        connectMode: "normal",
        slotId,
        firmwareId: action.firmwareId,
        address: QA_DEFAULT_FLASH_ADDRESS,
      },
      null,
    );
  } catch (error) {
    // Let a later check try again.
    doneAt.delete(action.key);
    logError(`could not start ${action.kind}`, error);
  }

  return action;
}

/**
 * Called for every finished bench job, before it is recorded on its unit.
 * Returns true for automation's own identify jobs: those are removed instead
 * of being recorded, so the timeline doesn't fill up with checks.
 */
export async function handleAutomationJobResult(job: QaBenchJobDto) {
  const probe = probeJobs.get(job.id);

  if (!probe) {
    return false;
  }

  probeJobs.delete(job.id);
  await db.delete(qaBenchJobs).where(eq(qaBenchJobs.id, job.id));
  broadcastStationChanged(job.stationId, "jobs");

  const chipUid = normalizeChipUid(job.result?.target?.uid);

  if (job.status === "succeeded" && chipUid) {
    await actOnBoard(probe.stationId, probe.slotId, chipUid).catch((error) => logError("could not act on a board", error));
  }

  return true;
}

/** After a flash job has been recorded on its unit: alerts, and the safety net for missed test results. */
export async function handleFlashRecorded(job: QaBenchJobDto, unitId: string | null) {
  if (job.kind !== "flash") {
    return;
  }

  const channel = job.firmware?.channel ?? "production";

  if (job.status === "failed") {
    await attention({
      stationId: job.stationId,
      unitId,
      slotId: job.slotId,
      level: "error",
      title: "Flash failed",
      message: `${job.firmware?.fileName ?? "Firmware"}: ${job.result?.error ?? "unknown error"}`,
    });
    return;
  }

  if (job.status !== "succeeded" || !unitId) {
    return;
  }

  if (channel === "production") {
    await attention({
      stationId: job.stationId,
      unitId,
      slotId: job.slotId,
      level: "success",
      title: "Production firmware flashed",
      message: "The board can be taken off the bench. Functional tests start when it reports over the air.",
    });
    return;
  }

  retried.delete(unitId);

  if (!job.slotId || !(await automationEnabled(job.stationId))) {
    return;
  }

  // The board's tests start at boot. If none arrive, the next check asks for them (decideSlotAction).
  const slotId = job.slotId;

  setTimeout(() => {
    void (async () => {
      const [unit] = await db.select({ chipUid: qaUnits.chipUid }).from(qaUnits).where(eq(qaUnits.id, unitId)).limit(1);

      if (unit) {
        await actOnBoard(job.stationId, slotId, unit.chipUid);
      }
    })().catch((error) => logError("safety net failed", error));
  }, SAFETY_NET_DELAY_MS).unref?.();
}

/** After a finished test run updated its unit: retry a network test, hand over to production, or alert. */
export async function handleRunFinished(input: {
  stationId: string;
  slotId: string | null;
  unitId: string;
  chipUid: string;
  verdict: { status: "passed" | "failed" | "pending"; failing: QaBoardTestId[]; untested: QaBoardTestId[] };
}) {
  const { stationId, slotId, unitId, chipUid, verdict } = input;
  const automatic = !!slotId && (await automationEnabled(stationId));
  const labels = (ids: QaBoardTestId[]) => ids.map((id) => QA_BOARD_TESTS[id].label).join(", ");

  if (verdict.status === "failed" && automatic && slotId) {
    const unitRetried = retried.get(unitId) ?? new Set<QaBoardTestId>();
    const next = pickRetry(verdict.failing, unitRetried);

    if (next) {
      unitRetried.add(next);
      retried.set(unitId, unitRetried);
      await sendSlotCommand(stationId, [slotId], `QA RUN ${next}\r\n`);
      return;
    }
  }

  if (verdict.status === "failed") {
    await attention({
      stationId,
      unitId,
      slotId,
      level: "error",
      title: "Board failed",
      message: `Failed: ${labels(verdict.failing)}. Take it off the bench for repair.`,
    });
    return;
  }

  if (verdict.status === "pending") {
    await attention({
      stationId,
      unitId,
      slotId,
      level: "warning",
      title: "Board not fully tested",
      message: `Not tested: ${labels(verdict.untested)}.`,
    });
    return;
  }

  if (automatic && slotId) {
    const action = await actOnBoard(stationId, slotId, chipUid);

    if (action.kind === "flash_production") {
      return;
    }

    await attention({
      stationId,
      unitId,
      slotId,
      level: "warning",
      title: "Board tests passed, production firmware not flashed",
      message: `${action.reason}.`,
    });
    return;
  }

  await attention({
    stationId,
    unitId,
    slotId,
    level: "success",
    title: "Board tests passed",
    message: "Flash the production firmware next.",
  });
}
