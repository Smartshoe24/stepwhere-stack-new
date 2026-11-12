import { and, asc, desc, eq, gte, inArray, isNull } from "drizzle-orm";
import { QA_DEFAULT_BAUD_RATE, QA_MAX_SLOTS } from "@stepwhere/types";
import type {
  QaBenchPortDto,
  QaSlotDto,
  QaStationSlotsDto,
  QaTestRunDto,
  UpdateQaStationSlotsInput,
} from "@stepwhere/types";

import { db } from "../../db/client";
import { qaStationSlots, qaStations, qaTestRuns, qaUnits } from "../../db/schema";
import { badRequest } from "../../shared/errors";
import { toRunDto } from "../qa-units/qa-test-runs.query";
import { combineBoardTestRuns } from "../qa-units/qa-tests.helpers";
import { serialPortKey } from "./qa-bench.helpers";
import { broadcastStationChanged } from "./qa-bench.realtime";
import { qaBenchRegistry } from "./qa-bench.registry";
import { listActiveJobs, requireStationRow } from "./qa-bench.service";

type SlotRow = typeof qaStationSlots.$inferSelect;

const LABEL_MAX_LENGTH = 40;
/** Don't ask the agent to open the same port again while an earlier request may still be pending. */
const OPEN_RETRY_MS = 15_000;
const openRequestedAt = new Map<string, number>();
/** Runs this recent, read from a slot's port before the slot existed, are moved onto it. */
const RECENT_RUN_MS = 60 * 60 * 1000;

export const defaultSlotLabel = (position: number) => `Slot ${position}`;

function livePorts(stationId: string) {
  return qaBenchRegistry.get(stationId)?.hardware?.ports ?? [];
}

/** The key of the adapter at `path` right now. */
export function portKeyForPath(stationId: string, path: string) {
  const port = livePorts(stationId).find((entry) => entry.path === path);

  return port ? serialPortKey(port) : `path:${path}`;
}

/** Where the slot's adapter is plugged in right now, or null while it is unplugged. */
function pathForPortKey(stationId: string, portKey: string) {
  return livePorts(stationId).find((entry) => serialPortKey(entry) === portKey)?.path ?? null;
}

/** The slot whose TTL adapter is at `path`, so a run read from that port is shown in the right place. */
export async function findSlotIdForPort(stationId: string, path: string) {
  const [slot] = await db
    .select({ id: qaStationSlots.id })
    .from(qaStationSlots)
    .where(and(eq(qaStationSlots.stationId, stationId), eq(qaStationSlots.portKey, portKeyForPath(stationId, path))))
    .limit(1);

  return slot?.id ?? null;
}

async function listSlotRows(stationId: string) {
  return db
    .select()
    .from(qaStationSlots)
    .where(eq(qaStationSlots.stationId, stationId))
    .orderBy(asc(qaStationSlots.position));
}

/** The latest run read from each slot, keyed by slot. */
async function latestRunsBySlot(slotIds: string[]) {
  const runs = new Map<string, QaTestRunDto>();

  if (slotIds.length === 0) {
    return runs;
  }

  const rows = await db
    .selectDistinctOn([qaTestRuns.slotId], { run: qaTestRuns, stationName: qaStations.name })
    .from(qaTestRuns)
    .leftJoin(qaStations, eq(qaStations.id, qaTestRuns.stationId))
    .where(inArray(qaTestRuns.slotId, slotIds))
    .orderBy(qaTestRuns.slotId, desc(qaTestRuns.startedAt));

  for (const row of rows) {
    if (row.run.slotId) {
      runs.set(row.run.slotId, toRunDto(row.run, row.stationName));
    }
  }

  return runs;
}

/** combineBoardTestRuns for several units in one query. */
async function verdictsForUnits(unitIds: string[]) {
  const verdicts = new Map<string, ReturnType<typeof combineBoardTestRuns>>();

  if (unitIds.length === 0) {
    return verdicts;
  }

  const rows = await db
    .select({ unitId: qaTestRuns.unitId, results: qaTestRuns.results })
    .from(qaTestRuns)
    .where(and(inArray(qaTestRuns.unitId, unitIds), inArray(qaTestRuns.status, ["passed", "failed"])))
    .orderBy(desc(qaTestRuns.startedAt));
  const byUnit = new Map<string, { results: (typeof rows)[number]["results"] }[]>();

  for (const row of rows) {
    if (row.unitId) {
      byUnit.set(row.unitId, [...(byUnit.get(row.unitId) ?? []), { results: row.results }]);
    }
  }

  for (const unitId of unitIds) {
    verdicts.set(unitId, combineBoardTestRuns(byUnit.get(unitId) ?? []));
  }

  return verdicts;
}

export async function getStationSlots(stationId: string): Promise<QaStationSlotsDto> {
  await requireStationRow(stationId);

  const live = qaBenchRegistry.get(stationId);
  const rows = await listSlotRows(stationId);
  const [runs, jobs] = await Promise.all([
    latestRunsBySlot(rows.map((row) => row.id)),
    listActiveJobs(stationId),
  ]);
  const unitIds = [...new Set([...runs.values()].map((run) => run.unitId).filter((id): id is string => !!id))];
  const [units, verdicts] = await Promise.all([
    unitIds.length
      ? db
        .select({ id: qaUnits.id, chipUid: qaUnits.chipUid, imei: qaUnits.imei, deviceId: qaUnits.deviceId })
        .from(qaUnits)
        .where(inArray(qaUnits.id, unitIds))
      : Promise.resolve([]),
    verdictsForUnits(unitIds),
  ]);
  const unitById = new Map(units.map((unit) => [unit.id, unit]));
  const probes = new Set(live?.hardware?.probes.map((probe) => probe.serial) ?? []);
  const probeUse = new Map<string, number>();

  for (const row of rows) {
    if (row.probeSerial) {
      probeUse.set(row.probeSerial, (probeUse.get(row.probeSerial) ?? 0) + 1);
    }
  }

  const slots: QaSlotDto[] = rows.map((row) => {
    const portPath = pathForPortKey(stationId, row.portKey);
    const run = runs.get(row.id) ?? null;
    const verdict = run?.unitId ? verdicts.get(run.unitId) ?? null : null;
    const unit = run?.unitId ? unitById.get(run.unitId) ?? null : null;

    return {
      id: row.id,
      stationId,
      position: row.position,
      label: row.label ?? defaultSlotLabel(row.position),
      portKey: row.portKey,
      portPath,
      portOpen: !!portPath && !!live?.serialSessions.has(portPath),
      portStable: row.portKey.startsWith("usb:"),
      probeSerial: row.probeSerial,
      probePresent: !!row.probeSerial && probes.has(row.probeSerial),
      probeShared: !!row.probeSerial && (probeUse.get(row.probeSerial) ?? 0) > 1,
      lastLineAt: portPath ? qaBenchRegistry.getLastLineAt(stationId, portPath) : null,
      activeJob: jobs.find((job) => job.slotId === row.id) ?? null,
      run,
      verdict: verdict ? { status: verdict.status, failing: verdict.failing, untested: verdict.untested } : null,
      unit,
    };
  });
  const slotByKey = new Map(rows.map((row) => [row.portKey, row.id]));
  const ports: QaBenchPortDto[] = (live?.hardware?.ports ?? []).map((port) => {
    const key = serialPortKey(port);

    return {
      key,
      path: port.path,
      manufacturer: port.manufacturer,
      serialNumber: port.serialNumber,
      likelyUsbTtl: port.likelyUsbTtl,
      open: !!live?.serialSessions.has(port.path),
      lastLineAt: qaBenchRegistry.getLastLineAt(stationId, port.path),
      slotId: slotByKey.get(key) ?? null,
    };
  });

  return { stationId, slots, ports };
}

function validateSlots(input: UpdateQaStationSlotsInput) {
  if (input.slots.length > QA_MAX_SLOTS) {
    throw badRequest(`A bench can have at most ${QA_MAX_SLOTS} slots.`);
  }

  const positions = new Set<number>();
  const ports = new Set<string>();

  return input.slots.map((slot) => {
    const label = slot.label?.trim() || null;
    const portKey = slot.portKey.trim();
    const probeSerial = slot.probeSerial?.trim() || null;

    if (!Number.isInteger(slot.position) || slot.position < 1 || slot.position > QA_MAX_SLOTS) {
      throw badRequest(`Slot numbers go from 1 to ${QA_MAX_SLOTS}.`);
    }

    if (positions.has(slot.position)) {
      throw badRequest(`Slot ${slot.position} is used twice.`);
    }

    if (!portKey) {
      throw badRequest(`Slot ${slot.position} needs a TTL adapter.`);
    }

    if (ports.has(portKey)) {
      throw badRequest(`Slot ${slot.position} uses a TTL adapter that another slot already uses.`);
    }

    if (label && label.length > LABEL_MAX_LENGTH) {
      throw badRequest(`Slot names are at most ${LABEL_MAX_LENGTH} characters.`);
    }

    positions.add(slot.position);
    ports.add(portKey);

    return { position: slot.position, label, portKey, probeSerial };
  });
}

/**
 * Replaces the station's slots. A slot keeps its id (and so its history) while its TTL adapter stays the same.
 */
export async function updateStationSlots(stationId: string, input: UpdateQaStationSlotsInput) {
  await requireStationRow(stationId);

  const wanted = validateSlots(input);

  await db.transaction(async (tx) => {
    const existing: SlotRow[] = await tx.select().from(qaStationSlots).where(eq(qaStationSlots.stationId, stationId));
    const keep = new Map(existing.map((row) => [row.portKey, row]));
    const removed = existing.filter((row) => !wanted.some((slot) => slot.portKey === row.portKey));

    if (removed.length) {
      await tx.delete(qaStationSlots).where(inArray(qaStationSlots.id, removed.map((row) => row.id)));
    }

    // Move kept slots out of the way first, so swapping two slot numbers never hits the unique index.
    const kept = existing.filter((row) => !removed.includes(row));

    for (const [index, row] of kept.entries()) {
      await tx.update(qaStationSlots).set({ position: -(index + 1) }).where(eq(qaStationSlots.id, row.id));
    }

    const now = new Date();

    for (const slot of wanted) {
      const current = keep.get(slot.portKey);

      if (current) {
        await tx
          .update(qaStationSlots)
          .set({ position: slot.position, label: slot.label, probeSerial: slot.probeSerial, updatedAt: now })
          .where(eq(qaStationSlots.id, current.id));
      } else {
        await tx.insert(qaStationSlots).values({ stationId, ...slot });
      }
    }
  });

  await attachRecentRunsToSlots(stationId);
  broadcastStationChanged(stationId, "slots");
  await ensureSlotPortsOpen(stationId);

  return getStationSlots(stationId);
}

/** Boards that started testing before their slot was set up still show on the slot. */
async function attachRecentRunsToSlots(stationId: string) {
  const since = new Date(Date.now() - RECENT_RUN_MS);

  for (const row of await listSlotRows(stationId)) {
    const path = pathForPortKey(stationId, row.portKey);

    if (!path) {
      continue;
    }

    await db
      .update(qaTestRuns)
      .set({ slotId: row.id })
      .where(and(
        eq(qaTestRuns.stationId, stationId),
        eq(qaTestRuns.serialPath, path),
        isNull(qaTestRuns.slotId),
        gte(qaTestRuns.startedAt, since),
      ));
  }
}

/**
 * Opens the TTL port of every slot whose adapter is plugged in, so 30 boards report without
 * anyone opening 30 consoles. Runs when the agent reports its hardware and when slots change.
 */
export async function ensureSlotPortsOpen(stationId: string) {
  const live = qaBenchRegistry.get(stationId);

  if (!live?.hardware) {
    return;
  }

  const rows = await listSlotRows(stationId);
  const now = Date.now();

  for (const row of rows) {
    const path = pathForPortKey(stationId, row.portKey);

    if (!path || live.serialSessions.has(path)) {
      continue;
    }

    const key = `${stationId}\u0000${path}`;

    if (now - (openRequestedAt.get(key) ?? 0) < OPEN_RETRY_MS) {
      continue;
    }

    openRequestedAt.set(key, now);
    qaBenchRegistry.send(stationId, { type: "serial.open", data: { path, baudRate: QA_DEFAULT_BAUD_RATE } });
  }
}

/** Writes the same text to several slots' TTL ports, e.g. `QA RUN` to every board on the bench. */
export async function sendSlotCommand(stationId: string, slotIds: string[] | null, data: string) {
  const live = qaBenchRegistry.get(stationId);
  const rows = await listSlotRows(stationId);
  const sentTo: string[] = [];

  for (const row of rows) {
    if (slotIds && !slotIds.includes(row.id)) {
      continue;
    }

    const path = pathForPortKey(stationId, row.portKey);

    if (path && live?.serialSessions.has(path) && qaBenchRegistry.send(stationId, { type: "serial.write", data: { path, data } })) {
      sentTo.push(row.id);
    }
  }

  return { sentTo };
}
