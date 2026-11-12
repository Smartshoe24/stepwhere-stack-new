import { and, asc, count, desc, eq, gte, ilike, isNull, ne, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { QA_UNIT_STAGES } from "@stepwhere/types";
import type {
  QaBenchJobDto,
  QaFirmwareChannel,
  QaOverviewDto,
  QaSerialLine,
  QaStationUnitDto,
  QaUnitDetailDto,
  QaUnitEventDto,
  QaUnitEventKind,
  QaUnitListItemDto,
  QaUnitListResponseDto,
  QaUnitStage,
  QaUnitStageStatus,
  QaUnitsListQuery,
  SetQaUnitStageInput,
  UpdateQaUnitInput,
} from "@stepwhere/types";

import { db } from "../../db/client";
import {
  childDeviceBindings,
  devices,
  qaBenchJobs,
  qaFirmwareUploads,
  qaStations,
  qaTestRuns,
  qaUnitEvents,
  qaUnits,
  users,
} from "../../db/schema";
import { badRequest, conflict, notFound } from "../../shared/errors";
import { isUniqueViolation } from "../qa-bench/qa-bench.helpers";
import { listJobsForUnit, loadFirmwareDto } from "../qa-bench/qa-bench.service";
import { qaBenchRegistry } from "../qa-bench/qa-bench.registry";
import { findSlotIdForPort } from "../qa-bench/qa-slots.service";
import { listTestRunsForUnit } from "./qa-test-runs.query";
import { broadcastUnitChanged } from "./qa-units.realtime";
import {
  STATION_UNIT_WINDOW_MS,
  describeStage,
  deriveFieldState,
  normalizeChipUid,
  normalizeImei,
  parseImeiFromSerialLine,
  shortChipUid,
  stageForFirmwareChannel,
} from "./qa-units.helpers";

export type Executor = Pick<typeof db, "select" | "insert" | "update">;

type EventInput = {
  unitId: string;
  kind: QaUnitEventKind;
  message: string;
  stage?: QaUnitStage | null;
  stageStatus?: QaUnitStageStatus | null;
  data?: Record<string, unknown> | null;
  jobId?: string | null;
  stationId?: string | null;
  actorUserId?: string | null;
};

export async function addEvent(executor: Executor, event: EventInput) {
  await executor.insert(qaUnitEvents).values({
    unitId: event.unitId,
    kind: event.kind,
    message: event.message,
    stage: event.stage ?? null,
    stageStatus: event.stageStatus ?? null,
    data: event.data ?? null,
    jobId: event.jobId ?? null,
    stationId: event.stationId ?? null,
    actorUserId: event.actorUserId ?? null,
  });
}

// ---------------------------------------------------------------------------
// Reading units
// ---------------------------------------------------------------------------

const unitStation = alias(qaStations, "qa_unit_station");

const unitColumns = {
  unit: qaUnits,
  firmware: {
    fileName: qaFirmwareUploads.fileName,
    channel: qaFirmwareUploads.channel,
    version: qaFirmwareUploads.version,
  },
  stationName: unitStation.name,
  device: {
    id: devices.id,
    hardwareIdentifier: devices.hardwareIdentifier,
    status: devices.status,
    lastSeenAt: devices.lastSeenAt,
  },
  bound: sql<boolean>`exists (
    select 1 from ${childDeviceBindings}
    where ${childDeviceBindings.deviceId} = ${qaUnits.deviceId} and ${childDeviceBindings.unboundAt} is null
  )`,
};

function selectUnits() {
  return db
    .select(unitColumns)
    .from(qaUnits)
    .leftJoin(qaFirmwareUploads, eq(qaFirmwareUploads.id, qaUnits.firmwareUploadId))
    .leftJoin(unitStation, eq(unitStation.id, qaUnits.lastStationId))
    .leftJoin(devices, eq(devices.id, qaUnits.deviceId));
}

type UnitSelectRow = Awaited<ReturnType<typeof selectUnits>>[number];

function toUnitListItem(row: UnitSelectRow, now = new Date()): QaUnitListItemDto {
  const { unit, firmware, device } = row;

  return {
    id: unit.id,
    chipUid: unit.chipUid,
    imei: unit.imei,
    stage: unit.stage,
    stageStatus: unit.stageStatus,
    stageChangedAt: unit.stageChangedAt.toISOString(),
    firmwareVersion: firmware?.version ?? null,
    firmwareChannel: firmware?.channel ?? null,
    firmwareFileName: firmware?.fileName ?? null,
    lastStationId: unit.lastStationId,
    lastStationName: row.stationName,
    device: device?.id
      ? {
        id: device.id,
        hardwareIdentifier: device.hardwareIdentifier,
        status: device.status,
        lastSeenAt: device.lastSeenAt?.toISOString() ?? null,
        bound: Boolean(row.bound),
      }
      : null,
    fieldState: unit.stage === "delivered" && unit.stageStatus !== "scrapped"
      ? deriveFieldState(device?.lastSeenAt ?? null, now)
      : null,
    createdAt: unit.createdAt.toISOString(),
    updatedAt: unit.updatedAt.toISOString(),
  };
}

async function loadUnitListItem(unitId: string) {
  const [row] = await selectUnits().where(eq(qaUnits.id, unitId)).limit(1);

  return row ? toUnitListItem(row) : null;
}

async function requireUnitRow(unitId: string) {
  const [row] = await db.select().from(qaUnits).where(eq(qaUnits.id, unitId)).limit(1);

  if (!row) {
    throw notFound("NOT_FOUND", "Unit not found.");
  }

  return row;
}

const UNIT_SORTS = {
  updatedAt: qaUnits.updatedAt,
  createdAt: qaUnits.createdAt,
  stage: qaUnits.stage,
  imei: qaUnits.imei,
} as const;

export async function listUnits(query: Required<Pick<QaUnitsListQuery, "page" | "pageSize">> & QaUnitsListQuery): Promise<QaUnitListResponseDto> {
  const filters: SQL[] = [];

  if (query.search) {
    const term = query.search.trim().replace(/[%_\\]/g, (char) => `\\${char}`);
    const pattern = `%${term}%`;
    filters.push(or(ilike(qaUnits.imei, pattern), ilike(qaUnits.chipUid, pattern)) as SQL);
  }

  if (query.stage) {
    filters.push(eq(qaUnits.stage, query.stage));
  }

  if (query.status) {
    filters.push(eq(qaUnits.stageStatus, query.status));
  }

  const where = filters.length > 0 ? and(...filters) : undefined;
  const sortColumn = UNIT_SORTS[query.sort ?? "updatedAt"] ?? qaUnits.updatedAt;
  const order = query.dir === "asc" ? asc(sortColumn) : desc(sortColumn);

  const [rows, [{ total }]] = await Promise.all([
    selectUnits()
      .where(where)
      .orderBy(order, desc(qaUnits.id))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize),
    db.select({ total: count() }).from(qaUnits).where(where),
  ]);

  const now = new Date();

  return {
    items: rows.map((row) => toUnitListItem(row, now)),
    page: query.page,
    pageSize: query.pageSize,
    total,
    hasMore: query.page * query.pageSize < total,
  };
}

const eventActor = alias(users, "qa_event_actor");
const eventStation = alias(qaStations, "qa_event_station");

async function listUnitEvents(unitId: string, limit: number): Promise<QaUnitEventDto[]> {
  const rows = await db
    .select({ event: qaUnitEvents, stationName: eventStation.name, actorName: eventActor.name })
    .from(qaUnitEvents)
    .leftJoin(eventStation, eq(eventStation.id, qaUnitEvents.stationId))
    .leftJoin(eventActor, eq(eventActor.id, qaUnitEvents.actorUserId))
    .where(eq(qaUnitEvents.unitId, unitId))
    .orderBy(desc(qaUnitEvents.createdAt), desc(qaUnitEvents.id))
    .limit(limit);

  return rows.map(({ event, stationName, actorName }) => ({
    id: event.id,
    kind: event.kind,
    stage: event.stage,
    stageStatus: event.stageStatus,
    message: event.message,
    data: event.data ?? null,
    jobId: event.jobId,
    stationId: event.stationId,
    stationName,
    actorName,
    createdAt: event.createdAt.toISOString(),
  }));
}

export async function getUnitDetail(unitId: string): Promise<QaUnitDetailDto> {
  const [row] = await selectUnits().where(eq(qaUnits.id, unitId)).limit(1);

  if (!row) {
    throw notFound("NOT_FOUND", "Unit not found.");
  }

  const [events, jobs, testRuns, firmware] = await Promise.all([
    listUnitEvents(unitId, 200),
    listJobsForUnit(unitId, 50),
    listTestRunsForUnit(unitId, 20),
    row.unit.firmwareUploadId ? loadFirmwareDto(row.unit.firmwareUploadId) : Promise.resolve(null),
  ]);

  return {
    ...toUnitListItem(row),
    notes: row.unit.notes,
    firmware,
    events,
    jobs,
    testRuns,
  };
}

// ---------------------------------------------------------------------------
// Bench integration
// ---------------------------------------------------------------------------

/** Finds or creates the unit for a chip UID, seen by a bench job or reported by the QA firmware. */
export async function upsertUnitByChip(
  executor: Executor,
  chipUid: string,
  stationId: string,
  jobId: string | null,
) {
  const [inserted] = await executor
    .insert(qaUnits)
    .values({ chipUid, lastStationId: stationId })
    .onConflictDoNothing({ target: qaUnits.chipUid })
    .returning();

  if (inserted) {
    await addEvent(executor, {
      unitId: inserted.id,
      kind: "registered",
      message: jobId
        ? `Registered from chip ${shortChipUid(chipUid)} on the bench.`
        : `Registered from chip ${shortChipUid(chipUid)} reported by the QA firmware.`,
      stage: "registered",
      stageStatus: "pending",
      data: { chipUid },
      jobId,
      stationId,
    });

    return inserted;
  }

  const [existing] = await executor.select().from(qaUnits).where(eq(qaUnits.chipUid, chipUid)).limit(1);

  return existing;
}

/**
 * Records what a finished identify or flash job means for its board: creates
 * the unit on first sight, links the job to it and, after a successful flash,
 * moves it to that firmware's stage. Returns the unit ID, or null when the job
 * never read a chip UID (no probe, wiring fault).
 */
export async function recordBenchJobOutcome(job: QaBenchJobDto): Promise<string | null> {
  const chipUid = normalizeChipUid(job.result?.target?.uid);

  if (!chipUid || (job.status !== "succeeded" && job.status !== "failed")) {
    return null;
  }

  const unitId = await db.transaction(async (tx) => {
    const unit = await upsertUnitByChip(tx, chipUid, job.stationId, job.id);

    await tx.update(qaBenchJobs).set({ unitId: unit.id }).where(eq(qaBenchJobs.id, job.id));

    const now = new Date();

    if (job.kind === "identify") {
      if (job.status === "succeeded") {
        await tx.update(qaUnits).set({ lastStationId: job.stationId, updatedAt: now }).where(eq(qaUnits.id, unit.id));
        await addEvent(tx, {
          unitId: unit.id,
          kind: "identified",
          message: "Identified on the bench.",
          data: { target: job.result?.target ?? null },
          jobId: job.id,
          stationId: job.stationId,
        });
      }

      return unit.id;
    }

    const firmware = job.firmware;
    const firmwareLabel = firmware
      ? `${firmware.fileName}${firmware.version ? ` ${firmware.version}` : ""}`
      : "firmware";

    if (job.status === "failed") {
      await tx.update(qaUnits).set({ lastStationId: job.stationId, updatedAt: now }).where(eq(qaUnits.id, unit.id));
      await addEvent(tx, {
        unitId: unit.id,
        kind: "flash_failed",
        message: `Flashing ${firmwareLabel} failed: ${job.result?.error ?? "unknown error"}`,
        data: { firmwareId: firmware?.id ?? null, error: job.result?.error ?? null },
        jobId: job.id,
        stationId: job.stationId,
      });

      return unit.id;
    }

    const channel: QaFirmwareChannel = firmware?.channel ?? "production";
    const stage = stageForFirmwareChannel(channel);
    const scrapped = unit.stageStatus === "scrapped";

    await tx
      .update(qaUnits)
      .set({
        firmwareUploadId: firmware?.id ?? unit.firmwareUploadId,
        lastStationId: job.stationId,
        updatedAt: now,
        // A scrapped board keeps its status; flashing it only records the firmware.
        ...(scrapped ? {} : { stage, stageStatus: "passed" as const, stageChangedAt: now }),
      })
      .where(eq(qaUnits.id, unit.id));
    await addEvent(tx, {
      unitId: unit.id,
      kind: "flashed",
      message: `Flashed ${firmwareLabel} (${channel === "qa" ? "QA" : "production"} firmware)${job.result?.verified ? ", verified" : ""}.`,
      stage: scrapped ? null : stage,
      stageStatus: scrapped ? null : "passed",
      data: {
        firmwareId: firmware?.id ?? null,
        channel,
        version: firmware?.version ?? null,
        verified: job.result?.verified ?? null,
        previousStage: unit.stage,
        previousStatus: unit.stageStatus,
      },
      jobId: job.id,
      stationId: job.stationId,
    });

    return unit.id;
  });

  broadcastUnitChanged(unitId, job.stationId);

  return unitId;
}

/** The unit last identified, flashed or tested on a station, and when. */
async function findLatestStationUnit(stationId: string) {
  const [[job], [run]] = await Promise.all([
    db
      .select({ unitId: qaBenchJobs.unitId, at: qaBenchJobs.finishedAt })
      .from(qaBenchJobs)
      .where(and(
        eq(qaBenchJobs.stationId, stationId),
        eq(qaBenchJobs.status, "succeeded"),
        sql`${qaBenchJobs.unitId} is not null`,
      ))
      .orderBy(desc(qaBenchJobs.finishedAt))
      .limit(1),
    db
      .select({ unitId: qaTestRuns.unitId, at: qaTestRuns.startedAt })
      .from(qaTestRuns)
      .where(and(eq(qaTestRuns.stationId, stationId), sql`${qaTestRuns.unitId} is not null`))
      .orderBy(desc(qaTestRuns.startedAt))
      .limit(1),
  ]);
  const latest = [job, run]
    .filter((entry): entry is { unitId: string; at: Date } => Boolean(entry?.unitId && entry.at))
    .sort((a, b) => b.at.getTime() - a.at.getTime())[0];

  return latest ? { unitId: latest.unitId, seenAt: latest.at } : null;
}

/** Only a board handled recently is assumed to still be on the station, so its TTL output is attributed to it. */
async function findRecentStationUnitId(stationId: string, now = new Date()) {
  const latest = await findLatestStationUnit(stationId);

  return latest && now.getTime() - latest.seenAt.getTime() <= STATION_UNIT_WINDOW_MS ? latest : null;
}

export async function getStationUnit(stationId: string): Promise<QaStationUnitDto> {
  const latest = await findLatestStationUnit(stationId);
  const unit = latest ? await loadUnitListItem(latest.unitId) : null;
  const seenAt = unit && latest ? latest.seenAt : null;

  return {
    stationId,
    unit,
    seenAt: seenAt?.toISOString() ?? null,
    current: !!seenAt && Date.now() - seenAt.getTime() <= STATION_UNIT_WINDOW_MS,
  };
}

/** IMEI already handled per port, so a board rebooting in a loop doesn't hit the DB on every boot. */
const handledSerialImeis = new Map<string, string>();

/** The board on one TTL port: the latest test run read from it, or the latest flash from its slot. */
async function findRecentPortUnitId(stationId: string, path: string, now = new Date()) {
  const slotId = await findSlotIdForPort(stationId, path);
  const [[run], [job]] = await Promise.all([
    db
      .select({ unitId: qaTestRuns.unitId, at: qaTestRuns.startedAt })
      .from(qaTestRuns)
      .where(and(
        eq(qaTestRuns.stationId, stationId),
        eq(qaTestRuns.serialPath, path),
        sql`${qaTestRuns.unitId} is not null`,
      ))
      .orderBy(desc(qaTestRuns.startedAt))
      .limit(1),
    slotId
      ? db
        .select({ unitId: qaBenchJobs.unitId, at: qaBenchJobs.finishedAt })
        .from(qaBenchJobs)
        .where(and(eq(qaBenchJobs.slotId, slotId), eq(qaBenchJobs.status, "succeeded"), sql`${qaBenchJobs.unitId} is not null`))
        .orderBy(desc(qaBenchJobs.finishedAt))
        .limit(1)
      : Promise.resolve([]),
  ]);
  const latest = [run, job]
    .filter((entry): entry is { unitId: string; at: Date } => Boolean(entry?.unitId && entry.at))
    .sort((a, b) => b.at.getTime() - a.at.getTime())[0];

  return latest && now.getTime() - latest.at.getTime() <= STATION_UNIT_WINDOW_MS ? latest : null;
}

/**
 * Watches one TTL port for the firmware's `[IMEI] …` boot line and links that IMEI to the board on
 * that port. With a single port open the board is the station's latest one, as on a one-board bench.
 */
export async function handleStationSerialLines(stationId: string, path: string, lines: QaSerialLine[], openPorts = 1) {
  for (const line of lines) {
    const imei = parseImeiFromSerialLine(line.text);

    if (!imei) {
      continue;
    }

    const recent = await findRecentPortUnitId(stationId, path)
      ?? (openPorts <= 1 ? await findRecentStationUnitId(stationId) : null);

    if (!recent) {
      continue;
    }

    const handledKey = `${stationId}\u0000${path}`;
    const key = `${recent.unitId}:${imei}`;

    if (handledSerialImeis.get(handledKey) === key) {
      continue;
    }

    handledSerialImeis.set(handledKey, key);
    await linkImei(recent.unitId, imei, { source: "ttl", stationId, actorUserId: null });
  }
}

type LinkContext = { source: "ttl" | "manual"; stationId: string | null; actorUserId: string | null };

/** The devices row for an IMEI, created as a fresh embedded device when missing. */
async function ensureDeviceForImei(executor: Executor, imei: string) {
  const [existing] = await executor
    .select({ id: devices.id })
    .from(devices)
    .where(eq(devices.hardwareIdentifier, imei))
    .limit(1);

  if (existing) {
    return existing.id;
  }

  const [created] = await executor
    .insert(devices)
    .values({ hardwareIdentifier: imei, platform: "embedded", status: "fresh" })
    .onConflictDoNothing({ target: devices.hardwareIdentifier })
    .returning({ id: devices.id });

  if (created) {
    return created.id;
  }

  const [raced] = await executor
    .select({ id: devices.id })
    .from(devices)
    .where(eq(devices.hardwareIdentifier, imei))
    .limit(1);

  return raced.id;
}

/** Links the IMEI a board reported about itself over TTL. */
export async function linkImeiReportedByBoard(unitId: string, imei: string, stationId: string | null) {
  return linkImei(unitId, imei, { source: "ttl", stationId, actorUserId: null });
}

/**
 * Links an IMEI to a unit. From TTL, a mismatch is only logged as a conflict;
 * a manual link throws so the admin sees why.
 */
async function linkImei(unitId: string, imei: string, context: LinkContext) {
  const unit = await requireUnitRow(unitId);

  if (unit.imei === imei) {
    return unit;
  }

  const [owner] = await db
    .select({ id: qaUnits.id, chipUid: qaUnits.chipUid })
    .from(qaUnits)
    .where(and(eq(qaUnits.imei, imei), ne(qaUnits.id, unitId)))
    .limit(1);

  if (unit.imei || owner) {
    const reason = owner
      ? `IMEI ${imei} already belongs to the unit with chip ${shortChipUid(owner.chipUid)}.`
      : `Board reported IMEI ${imei}, but the unit is linked to ${unit.imei}.`;

    if (context.source === "manual" && owner) {
      throw conflict(reason);
    }

    if (context.source === "ttl") {
      await addEvent(db, {
        unitId,
        kind: "imei_conflict",
        message: `${reason} Check whether the modem was swapped.`,
        data: { imei, currentImei: unit.imei, otherUnitId: owner?.id ?? null },
        stationId: context.stationId,
      });
      broadcastUnitChanged(unitId, context.stationId);

      return unit;
    }
  }

  try {
    await db.transaction(async (tx) => {
      const deviceId = await ensureDeviceForImei(tx, imei);

      await tx.update(qaUnits).set({ imei, deviceId, updatedAt: new Date() }).where(eq(qaUnits.id, unitId));
      await addEvent(tx, {
        unitId,
        kind: "imei_linked",
        message: unit.imei
          ? `IMEI changed from ${unit.imei} to ${imei}.`
          : context.source === "ttl"
            ? `IMEI ${imei} read from the board's TTL output.`
            : `IMEI ${imei} entered by hand.`,
        data: { imei, previousImei: unit.imei, source: context.source },
        stationId: context.stationId,
        actorUserId: context.actorUserId,
      });
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw conflict(`IMEI ${imei} already belongs to another unit.`);
    }

    throw error;
  }

  broadcastUnitChanged(unitId, context.stationId);

  return requireUnitRow(unitId);
}

// ---------------------------------------------------------------------------
// Admin changes
// ---------------------------------------------------------------------------

export async function updateUnit(unitId: string, input: UpdateQaUnitInput, userId: string) {
  const unit = await requireUnitRow(unitId);

  if (input.imei !== undefined) {
    if (input.imei === null) {
      if (unit.imei) {
        await db.transaction(async (tx) => {
          await tx.update(qaUnits).set({ imei: null, deviceId: null, updatedAt: new Date() }).where(eq(qaUnits.id, unitId));
          await addEvent(tx, {
            unitId,
            kind: "imei_linked",
            message: `IMEI ${unit.imei} unlinked.`,
            data: { imei: null, previousImei: unit.imei, source: "manual" },
            actorUserId: userId,
          });
        });
      }
    } else {
      const imei = normalizeImei(input.imei);

      if (!imei) {
        throw badRequest("IMEI must be 15 digits with a valid check digit.");
      }

      await linkImei(unitId, imei, { source: "manual", stationId: null, actorUserId: userId });
    }
  }

  if (input.notes !== undefined) {
    const notes = input.notes?.trim() || null;

    if (notes !== unit.notes) {
      await db.update(qaUnits).set({ notes, updatedAt: new Date() }).where(eq(qaUnits.id, unitId));
    }
  }

  broadcastUnitChanged(unitId, null);

  return getUnitDetail(unitId);
}

export async function setUnitStage(unitId: string, input: SetQaUnitStageInput, userId: string) {
  const unit = await requireUnitRow(unitId);
  const note = input.note?.trim() || null;

  if (unit.stage === input.stage && unit.stageStatus === input.status && !note) {
    return getUnitDetail(unitId);
  }

  const now = new Date();

  await db.transaction(async (tx) => {
    await tx
      .update(qaUnits)
      .set({ stage: input.stage, stageStatus: input.status, stageChangedAt: now, updatedAt: now })
      .where(eq(qaUnits.id, unitId));
    await addEvent(tx, {
      unitId,
      kind: "stage_changed",
      message: `${describeStage(input.stage, input.status)}.${note ? ` ${note}` : ""}`,
      stage: input.stage,
      stageStatus: input.status,
      data: { previousStage: unit.stage, previousStatus: unit.stageStatus, note },
      actorUserId: userId,
    });
  });

  broadcastUnitChanged(unitId, null);

  return getUnitDetail(unitId);
}

export async function addUnitNote(unitId: string, note: string, userId: string) {
  await requireUnitRow(unitId);

  await addEvent(db, { unitId, kind: "note", message: note.trim(), actorUserId: userId });
  await db.update(qaUnits).set({ updatedAt: new Date() }).where(eq(qaUnits.id, unitId));

  broadcastUnitChanged(unitId, null);

  return getUnitDetail(unitId);
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

export async function getOverview(): Promise<QaOverviewDto> {
  const now = new Date();
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const [stageRows, deliveredRows, [registered], [flashed], [failed], failures, stations] = await Promise.all([
    db
      .select({ stage: qaUnits.stage, status: qaUnits.stageStatus, total: count() })
      .from(qaUnits)
      .groupBy(qaUnits.stage, qaUnits.stageStatus),
    db
      .select({ lastSeenAt: devices.lastSeenAt })
      .from(qaUnits)
      .leftJoin(devices, eq(devices.id, qaUnits.deviceId))
      .where(and(eq(qaUnits.stage, "delivered"), ne(qaUnits.stageStatus, "scrapped"))),
    db.select({ total: count() }).from(qaUnits).where(gte(qaUnits.createdAt, since)),
    db
      .select({ total: sql<number>`count(distinct ${qaUnitEvents.unitId})::int` })
      .from(qaUnitEvents)
      .where(and(eq(qaUnitEvents.kind, "flashed"), gte(qaUnitEvents.createdAt, since))),
    db
      .select({ total: sql<number>`count(distinct ${qaUnitEvents.unitId})::int` })
      .from(qaUnitEvents)
      .where(and(
        gte(qaUnitEvents.createdAt, since),
        or(eq(qaUnitEvents.stageStatus, "failed"), eq(qaUnitEvents.kind, "flash_failed")),
      )),
    selectUnits()
      .where(eq(qaUnits.stageStatus, "failed"))
      .orderBy(desc(qaUnits.stageChangedAt))
      .limit(8),
    db.select({ id: qaStations.id }).from(qaStations).where(isNull(qaStations.revokedAt)),
  ]);

  const byStage = QA_UNIT_STAGES.map((stage) => ({ stage, pending: 0, passed: 0, failed: 0 }));
  let total = 0;
  let scrapped = 0;

  for (const row of stageRows) {
    total += row.total;

    if (row.status === "scrapped") {
      scrapped += row.total;
      continue;
    }

    const entry = byStage.find((item) => item.stage === row.stage);

    if (entry) {
      entry[row.status] += row.total;
    }
  }

  const field = { active: 0, offline: 0, neverSeen: 0 };

  for (const row of deliveredRows) {
    const state = deriveFieldState(row.lastSeenAt, now);
    if (state === "active") field.active += 1;
    else if (state === "offline") field.offline += 1;
    else field.neverSeen += 1;
  }

  return {
    total,
    byStage,
    scrapped,
    failed: byStage.reduce((sum, item) => sum + item.failed, 0),
    field,
    last24h: { registered: registered.total, flashed: flashed.total, failed: failed.total },
    recentFailures: failures.map((row) => toUnitListItem(row, now)),
    stations: {
      online: stations.filter((station) => qaBenchRegistry.isOnline(station.id)).length,
      total: stations.length,
    },
  };
}
