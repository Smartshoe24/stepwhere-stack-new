/**
 * Functional tests: once a board runs the production firmware it reports its
 * location over GSM to the ingest endpoint. Until a parent binds it to a child,
 * ingest refuses those reports (404). Before refusing, the report is recorded
 * as functional-test evidence on the board's QA unit, matched by IMEI:
 *
 * - GSM: a report arrived at all (modem, SIM, data and server path work);
 * - steps: it carried the motion sensor's step count;
 * - location: GPS, or the Wi-Fi / cell-tower fallback, located it.
 *
 * When all three are seen, the unit moves to Functional tests: passed. The
 * device still gets the same 404 as before, so the firmware behaves as it did.
 */
import { eq } from "drizzle-orm";
import type { LocationTelemetryInput } from "@stepwhere/types";

import { db } from "../../db/client";
import { qaUnits } from "../../db/schema";
import { getSafeErrorDetails } from "../../shared/background-task";
import { AppError } from "../../shared/errors";
import { broadcastAttention } from "../qa-bench/qa-bench.realtime";
import { applyFunctionalReport, functionalVerdict, QA_FUNCTIONAL_STAGES } from "./qa-functional.helpers";
import { broadcastUnitChanged } from "./qa-units.realtime";
import { normalizeImei } from "./qa-units.helpers";
import { addEvent } from "./qa-units.service";

/** Records one location report as functional-test evidence, if it comes from a QA unit that is due for it. */
export async function recordFunctionalReport(hardwareIdentifier: string, input: LocationTelemetryInput) {
  const imei = normalizeImei(hardwareIdentifier);

  if (!imei) {
    return;
  }

  const [unit] = await db.select().from(qaUnits).where(eq(qaUnits.imei, imei)).limit(1);

  if (!unit || unit.stageStatus === "scrapped" || !QA_FUNCTIONAL_STAGES.includes(unit.stage)) {
    return;
  }

  const now = new Date();
  const checks = applyFunctionalReport(unit.functionalChecks ?? null, {
    latitude: input.latitude,
    longitude: input.longitude,
    gpsFixValid: input.gpsFixValid,
    satelliteCount: input.satelliteCount,
    wifiAccessPoints: input.wifi?.accessPoints.length ?? 0,
    cellTowers: input.cellular?.towers.length ?? 0,
    stepCounter: input.stepCounter,
    batteryVoltageMv: input.batteryVoltageMv,
  }, now);
  const verdict = functionalVerdict(checks);
  const passedNow = verdict.passed && !checks.passedAt;
  const startedNow = unit.stage === "production_firmware";

  if (passedNow) {
    checks.passedAt = now.toISOString();
  }

  const location = [verdict.gps && "GPS", verdict.wifi && "Wi-Fi", verdict.cell && "cell tower"].filter(Boolean).join(", ");

  await db.transaction(async (tx) => {
    await tx
      .update(qaUnits)
      .set({
        functionalChecks: checks,
        updatedAt: now,
        ...(passedNow
          ? { stage: "functional_tests" as const, stageStatus: "passed" as const, stageChangedAt: now }
          : startedNow
            ? { stage: "functional_tests" as const, stageStatus: "pending" as const, stageChangedAt: now }
            : {}),
      })
      .where(eq(qaUnits.id, unit.id));

    if (startedNow && !passedNow) {
      await addEvent(tx, {
        unitId: unit.id,
        kind: "stage_changed",
        message: "First report over the air: functional tests started.",
        stage: "functional_tests",
        stageStatus: "pending",
        data: { checks },
      });
    }

    if (passedNow) {
      await addEvent(tx, {
        unitId: unit.id,
        kind: "stage_changed",
        message: `Functional tests passed: report over GSM, step count, location by ${location}.`,
        stage: "functional_tests",
        stageStatus: "passed",
        data: { checks },
      });
    }
  });

  broadcastUnitChanged(unit.id, unit.lastStationId);

  if (passedNow && unit.lastStationId) {
    broadcastAttention({
      stationId: unit.lastStationId,
      unitId: unit.id,
      slotId: null,
      slotLabel: null,
      level: "success",
      title: "Functional tests passed",
      message: `${imei}: GSM, steps and location (${location}) all reported.`,
    });
  }
}

/**
 * Runs location ingest; when it refuses a report because the device is not
 * bound to a child yet, records the report for the QA functional tests first.
 * The error is passed on unchanged.
 */
export async function withQaFunctionalEvidence<T>(hardwareIdentifier: string, input: LocationTelemetryInput, ingest: () => Promise<T>) {
  try {
    return await ingest();
  } catch (error) {
    if (error instanceof AppError && error.status === 404) {
      await recordFunctionalReport(hardwareIdentifier, input).catch((recordError) => {
        console.error("[qa-functional] could not record a report", getSafeErrorDetails(recordError));
      });
    }

    throw error;
  }
}
