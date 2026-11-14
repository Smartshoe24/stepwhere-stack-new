import { describe, expect, it } from "vitest";

import { applyFunctionalReport, functionalVerdict, reportHasGpsFix, type FunctionalReport } from "./qa-functional.helpers";

const report = (extra: Partial<FunctionalReport> = {}): FunctionalReport => ({
  latitude: 0,
  longitude: 0,
  gpsFixValid: false,
  satelliteCount: 0,
  wifiAccessPoints: 0,
  cellTowers: 0,
  stepCounter: 0,
  batteryVoltageMv: 3900,
  ...extra,
});
const t1 = new Date("2026-11-14T10:00:00Z");
const t2 = new Date("2026-11-14T10:01:00Z");

describe("reportHasGpsFix", () => {
  it("needs a valid fix with 3 satellites away from 0,0", () => {
    expect(reportHasGpsFix(report({ latitude: 24.58, longitude: 73.71, gpsFixValid: true, satelliteCount: 5 }))).toBe(true);
    expect(reportHasGpsFix(report({ latitude: 24.58, longitude: 73.71, gpsFixValid: true, satelliteCount: 2 }))).toBe(false);
    expect(reportHasGpsFix(report({ gpsFixValid: true, satelliteCount: 8 }))).toBe(false);
  });
});

describe("functional checks", () => {
  it("is not passed before any report", () => {
    expect(functionalVerdict(null)).toMatchObject({ passed: false, gsm: false });
  });

  it("passes on a report with steps and a cell tower (indoors, no GPS)", () => {
    const checks = applyFunctionalReport(null, report({ cellTowers: 1 }), t1);
    expect(checks).toMatchObject({ reports: 1, cellAt: t1.toISOString(), gpsFixAt: null, stepCounter: 0 });
    expect(functionalVerdict(checks)).toMatchObject({ passed: true, gsm: true, steps: true, location: true, gps: false, cell: true });
  });

  it("waits for a location source", () => {
    expect(functionalVerdict(applyFunctionalReport(null, report(), t1))).toMatchObject({ passed: false, gsm: true, location: false });
  });

  it("keeps the first time each check passed and the latest counters", () => {
    let checks = applyFunctionalReport(null, report({ wifiAccessPoints: 3, stepCounter: 4 }), t1);
    checks = applyFunctionalReport(checks, report({ wifiAccessPoints: 2, stepCounter: 9, latitude: 24.58, longitude: 73.71, gpsFixValid: true, satelliteCount: 6 }), t2);
    expect(checks).toMatchObject({
      firstReportAt: t1.toISOString(),
      lastReportAt: t2.toISOString(),
      reports: 2,
      wifiAt: t1.toISOString(),
      gpsFixAt: t2.toISOString(),
      stepCounter: 9,
    });
    expect(functionalVerdict(checks)).toMatchObject({ passed: true, gps: true, wifi: true, cell: false });
  });

  it("needs a step count from the motion sensor", () => {
    expect(functionalVerdict(applyFunctionalReport(null, report({ cellTowers: 1, stepCounter: undefined }), t1)).passed).toBe(false);
  });
});
