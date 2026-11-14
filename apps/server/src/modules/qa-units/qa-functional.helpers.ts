import type { QaFunctionalChecks, QaUnitStage } from "@stepwhere/types";

/** One location report from the production firmware, reduced to what the functional tests need. */
export type FunctionalReport = {
  latitude: number;
  longitude: number;
  gpsFixValid: boolean | undefined;
  satelliteCount: number | null | undefined;
  wifiAccessPoints: number;
  cellTowers: number;
  stepCounter: number | null | undefined;
  batteryVoltageMv: number | null | undefined;
};

/** Stages in which a board's reports count as functional-test evidence. */
export const QA_FUNCTIONAL_STAGES: readonly QaUnitStage[] = ["production_firmware", "functional_tests"];

/** Same rule as telemetry ingest: a real fix, with at least 3 satellites, not 0,0. */
export function reportHasGpsFix(report: FunctionalReport) {
  if (report.latitude === 0 && report.longitude === 0) {
    return false;
  }

  return report.gpsFixValid === undefined ? true : report.gpsFixValid && (report.satelliteCount ?? 0) >= 3;
}

/** Folds one report into the unit's functional checks. */
export function applyFunctionalReport(previous: QaFunctionalChecks | null, report: FunctionalReport, at: Date): QaFunctionalChecks {
  const iso = at.toISOString();
  const checks: QaFunctionalChecks = previous
    ? { ...previous }
    : {
      firstReportAt: iso,
      lastReportAt: iso,
      reports: 0,
      gpsFixAt: null,
      wifiAt: null,
      cellAt: null,
      stepCounter: null,
      batteryVoltageMv: null,
      passedAt: null,
    };

  checks.reports += 1;
  checks.lastReportAt = iso;

  if (!checks.gpsFixAt && reportHasGpsFix(report)) checks.gpsFixAt = iso;
  if (!checks.wifiAt && report.wifiAccessPoints > 0) checks.wifiAt = iso;
  if (!checks.cellAt && report.cellTowers > 0) checks.cellAt = iso;
  if (typeof report.stepCounter === "number" && Number.isFinite(report.stepCounter)) checks.stepCounter = report.stepCounter;
  if (typeof report.batteryVoltageMv === "number" && report.batteryVoltageMv > 0) checks.batteryVoltageMv = report.batteryVoltageMv;

  return checks;
}

/**
 * Functional tests pass when the board's reports reached the server over GSM,
 * carried a step count from the motion sensor, and located the board by GPS,
 * Wi-Fi or a cell tower. Wi-Fi and cell data are only sent while GPS has no
 * fix, so any one location source is enough.
 */
export function functionalVerdict(checks: QaFunctionalChecks | null) {
  const gsm = !!checks && checks.reports > 0;
  const steps = checks?.stepCounter != null;
  const gps = !!checks?.gpsFixAt;
  const wifi = !!checks?.wifiAt;
  const cell = !!checks?.cellAt;
  const location = gps || wifi || cell;

  return { passed: gsm && steps && location, gsm, steps, location, gps, wifi, cell };
}
