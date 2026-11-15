/**
 * Test log for boards in QA that are not bound to a child (rules in
 * qa-test-log.helpers.ts). Called by ingest after it found no child binding,
 * before it answers 404.
 *
 * - A board whose QA unit is before Ready to ship: the upload is stored in
 *   qa_unit_reports and the device gets 201.
 * - A never-seen board (no QA unit for its IMEI, never bound to a child, IMEI
 *   of our modem model, at most 30 new boards an hour) is added to the device
 *   list, and to the QA list when the upload carries its chip UID.
 * - QA firmware uploads get up to 10 Wi-Fi/cell lookups, 30 s apart.
 */
import { and, asc, count, eq, gte, isNull, lte, or, sql } from "drizzle-orm";
import type { LocationTelemetryInput, QaTestLogDto, QaTestReportDto } from "@stepwhere/types";

import { env } from "../../config/env";
import { db } from "../../db/client";
import { childDeviceBindings, devices, qaUnitEvents, qaUnitReports, qaUnits } from "../../db/schema";
import { notFound } from "../../shared/errors";
import { hasUsableNetworkObservation, servingCellKey } from "../telemetry/cell-geolocation";
import { GoogleGeolocationRequestError, locateFromCellTowers } from "../telemetry/google-geolocation.client";
import { getEligibleWifiAccessPoints } from "../telemetry/wifi-geolocation";
import {
  acceptsTestReports,
  autoRegisterStage,
  imeiHasAllowedTac,
  networkLookupDue,
  QA_AUTO_REGISTER_PER_HOUR,
  QA_AUTO_REGISTER_SOURCE,
  QA_NETWORK_LOOKUP_INTERVAL_MS,
  QA_NETWORK_LOOKUP_MAX,
  reportChipUid,
  reportFirmware,
} from "./qa-test-log.helpers";
import { reportHasGpsFix } from "./qa-functional.helpers";
import { finalTestSteps } from "./qa-motion.helpers";
import { broadcastUnitChanged } from "./qa-units.realtime";
import { normalizeImei, shortChipUid } from "./qa-units.helpers";
import { addEvent, ensureDeviceForImei } from "./qa-units.service";

type UnitRow = typeof qaUnits.$inferSelect;

/** Records the upload in the board's test log; returns its unit ID, or null when ingest should refuse it. */
export async function recordTestReport(hardwareIdentifier: string, input: LocationTelemetryInput) {
  const imei = normalizeImei(hardwareIdentifier);
  if (!imei) return null;

  const [existing] = await db.select().from(qaUnits).where(eq(qaUnits.imei, imei)).limit(1);
  const unit = existing ?? await autoRegister(imei, input);
  if (!unit || !acceptsTestReports(unit)) return null;

  const now = new Date();
  const lookup = await networkLookup(unit, input, now);
  const gpsFix = reportHasGpsFix({
    latitude: input.latitude,
    longitude: input.longitude,
    gpsFixValid: input.gpsFixValid,
    satelliteCount: input.satelliteCount,
    wifiAccessPoints: input.wifi?.accessPoints.length ?? 0,
    cellTowers: input.cellular?.towers.length ?? 0,
    stepCounter: input.stepCounter,
    batteryVoltageMv: input.batteryVoltageMv,
  });

  await db.insert(qaUnitReports).values({
    unitId: unit.id,
    receivedAt: now,
    firmware: reportFirmware(input),
    stage: unit.stage,
    gpsFix,
    latitude: gpsFix ? input.latitude.toFixed(6) : null,
    longitude: gpsFix ? input.longitude.toFixed(6) : null,
    satelliteCount: input.satelliteCount ?? null,
    cell: servingCellKey(input.cellular),
    towerCount: input.cellular?.towers.length ?? 0,
    wifiCount: getEligibleWifiAccessPoints(input.wifi).length,
    batteryVoltageMv: input.batteryVoltageMv ?? null,
    stepCounter: input.stepCounter,
    networkLookup: lookup.made,
    networkLatitude: lookup.location ? lookup.location.latitude.toFixed(6) : null,
    networkLongitude: lookup.location ? lookup.location.longitude.toFixed(6) : null,
    networkAccuracyMeters: lookup.location ? lookup.location.accuracyMeters.toFixed(2) : null,
    networkError: lookup.error,
    payload: input as unknown as Record<string, unknown>,
  });

  const unitUpdate: Partial<typeof qaUnits.$inferInsert> = { updatedAt: now };
  if (lookup.location && !unit.networkLocatedAt) unitUpdate.networkLocatedAt = now;
  await db.update(qaUnits).set(unitUpdate).where(eq(qaUnits.id, unit.id));

  if (unit.deviceId) {
    await db.update(devices).set({
      lastSeenAt: now,
      updatedAt: now,
      ...(input.fw ? { firmwareVersion: input.fw.app, firmwareStatus: input.fw, firmwareReportedAt: now } : {}),
    }).where(eq(devices.id, unit.deviceId));
  }

  if (lookup.location && !unit.networkLocatedAt) {
    await addEvent(db, {
      unitId: unit.id,
      kind: "note",
      message: `Wi-Fi/GSM location passed: located within ${Math.round(lookup.location.accuracyMeters)} m.`,
      data: { ...lookup.location, check: "network_location" },
    });
  }
  broadcastUnitChanged(unit.id, unit.lastStationId);

  return unit.id;
}

/** A never-seen board: device list always, QA list when the upload carries its chip UID. */
async function autoRegister(imei: string, input: LocationTelemetryInput): Promise<UnitRow | null> {
  if (!imeiHasAllowedTac(imei, env.QA_AUTO_REGISTER_TACS)) return null;

  const [device] = await db.select({ id: devices.id }).from(devices).where(eq(devices.hardwareIdentifier, imei)).limit(1);
  if (device) {
    const [binding] = await db.select({ id: childDeviceBindings.id }).from(childDeviceBindings)
      .where(eq(childDeviceBindings.deviceId, device.id)).limit(1);
    if (binding) return null;   // a customer's device once: never treated as a test board
  }

  const [recent] = await db.select({ n: count() }).from(qaUnitEvents).where(and(
    eq(qaUnitEvents.kind, "registered"),
    gte(qaUnitEvents.createdAt, new Date(Date.now() - 60 * 60 * 1_000)),
    sql`${qaUnitEvents.data} ->> 'source' = ${QA_AUTO_REGISTER_SOURCE}`,
  ));
  if ((recent?.n ?? 0) >= QA_AUTO_REGISTER_PER_HOUR) {
    console.warn("[qa-test-log] auto-registration limit reached", { imei, perHour: QA_AUTO_REGISTER_PER_HOUR });
    return null;
  }

  const chipUid = reportChipUid(input);

  return db.transaction(async (tx) => {
    const deviceId = await ensureDeviceForImei(tx, imei);
    if (!chipUid) return null;

    const [byChip] = await tx.select().from(qaUnits).where(eq(qaUnits.chipUid, chipUid)).limit(1);
    if (byChip) {
      if (byChip.imei) return null;   // chip already linked to another IMEI: leave it to the bench
      const [linked] = await tx.update(qaUnits).set({ imei, deviceId, updatedAt: new Date() })
        .where(and(eq(qaUnits.id, byChip.id), isNull(qaUnits.imei))).returning();
      if (!linked) return null;
      await addEvent(tx, {
        unitId: linked.id,
        kind: "imei_linked",
        message: `IMEI ${imei} reported in the board's first upload.`,
        data: { imei, previousImei: null, source: QA_AUTO_REGISTER_SOURCE },
      });
      return linked;
    }

    const stage = autoRegisterStage(input);
    const [created] = await tx.insert(qaUnits).values({ chipUid, imei, deviceId, stage, stageStatus: "pending" })
      .onConflictDoNothing().returning();
    if (!created) return null;
    await addEvent(tx, {
      unitId: created.id,
      kind: "registered",
      message: `Registered from its first upload (chip ${shortChipUid(chipUid)}, IMEI ${imei}, ${reportFirmware(input) ?? "unknown firmware"}).`,
      stage,
      stageStatus: "pending",
      data: { chipUid, imei, source: QA_AUTO_REGISTER_SOURCE },
    });
    return created;
  });
}

type LookupOutcome = {
  made: boolean;
  location: { latitude: number; longitude: number; accuracyMeters: number } | null;
  error: string | null;
};

async function networkLookup(unit: UnitRow, input: LocationTelemetryInput, now: Date): Promise<LookupOutcome> {
  const none: LookupOutcome = { made: false, location: null, error: null };
  if (!networkLookupDue({
    isQaFirmware: Boolean(input.qa),
    enabled: env.CELL_GEOLOCATION_ENABLED,
    usableObservation: hasUsableNetworkObservation(input.cellular, input.wifi),
    lookups: unit.networkLookups,
    lastLookupAt: unit.lastNetworkLookupAt,
    now,
  })) return none;

  // Claim one lookup: parallel uploads from the same board cannot both pass.
  const [claimed] = await db.update(qaUnits)
    .set({ networkLookups: sql`${qaUnits.networkLookups} + 1`, lastNetworkLookupAt: now })
    .where(and(
      eq(qaUnits.id, unit.id),
      sql`${qaUnits.networkLookups} < ${QA_NETWORK_LOOKUP_MAX}`,
      or(
        isNull(qaUnits.lastNetworkLookupAt),
        lte(qaUnits.lastNetworkLookupAt, new Date(now.getTime() - QA_NETWORK_LOOKUP_INTERVAL_MS)),
      ),
    ))
    .returning({ lookups: qaUnits.networkLookups });
  if (!claimed) return none;

  try {
    const location = await locateFromCellTowers(input.cellular, input.wifi);
    console.info("[qa-test-log] network lookup succeeded", {
      unitId: unit.id,
      lookup: claimed.lookups,
      accuracyMeters: location.accuracyMeters,
    });
    return { made: true, location, error: null };
  } catch (error) {
    const status = error instanceof GoogleGeolocationRequestError ? error.status : null;
    const message = `${error instanceof Error ? error.message : "Lookup failed."}${status ? ` (HTTP ${status})` : ""}`;
    console.warn("[qa-test-log] network lookup failed", { unitId: unit.id, lookup: claimed.lookups, providerStatus: status });
    return { made: true, location: null, error: message.slice(0, 200) };
  }
}

const numberOrNull = (value: string | null) => (value == null ? null : Number(value));

export async function getTestLog(unitId: string, limit: number): Promise<QaTestLogDto> {
  const [unit] = await db.select().from(qaUnits).where(eq(qaUnits.id, unitId)).limit(1);
  if (!unit) throw notFound("NOT_FOUND", "QA unit not found.");

  const [rows, [total]] = await Promise.all([
    db.select().from(qaUnitReports).where(eq(qaUnitReports.unitId, unitId))
      .orderBy(sql`${qaUnitReports.receivedAt} desc`).limit(limit),
    db.select({ n: count() }).from(qaUnitReports).where(eq(qaUnitReports.unitId, unitId)),
  ]);

  const finalCounters = await db
    .select({ stepCounter: qaUnitReports.stepCounter })
    .from(qaUnitReports)
    .where(and(eq(qaUnitReports.unitId, unitId), eq(qaUnitReports.stage, "final_test")))
    .orderBy(asc(qaUnitReports.receivedAt))
    .limit(2000);

  return {
    unitId,
    networkLookups: unit.networkLookups,
    networkLookupMax: QA_NETWORK_LOOKUP_MAX,
    networkLocatedAt: unit.networkLocatedAt?.toISOString() ?? null,
    total: total?.n ?? 0,
    finalTestSteps: finalTestSteps(
      finalCounters.map((row) => row.stepCounter).filter((value): value is number => value != null),
    ),
    entries: rows.map((row): QaTestReportDto => ({
      id: row.id,
      receivedAt: row.receivedAt.toISOString(),
      firmware: row.firmware,
      stage: row.stage,
      gpsFix: row.gpsFix,
      latitude: numberOrNull(row.latitude),
      longitude: numberOrNull(row.longitude),
      satelliteCount: row.satelliteCount,
      cell: row.cell,
      towerCount: row.towerCount,
      wifiCount: row.wifiCount,
      batteryVoltageMv: row.batteryVoltageMv,
      stepCounter: row.stepCounter,
      networkLookup: row.networkLookup,
      networkLatitude: numberOrNull(row.networkLatitude),
      networkLongitude: numberOrNull(row.networkLongitude),
      networkAccuracyMeters: numberOrNull(row.networkAccuracyMeters),
      networkError: row.networkError,
    })),
  };
}
