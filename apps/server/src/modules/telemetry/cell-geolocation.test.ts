import { describe, expect, it } from "vitest";

import {
  advanceCellLookupAfterSuccess,
  CELL_FAST_INTERVAL_MS,
  CELL_INITIAL_DELAY_MS,
  CELL_NORMAL_INTERVAL_MS,
  getCellLookupIntervals,
  getInitialCellLookupAt,
  isCellLookupDue,
  shouldLookupEveryCellObservation,
} from "./cell-geolocation";

describe("cell geolocation cadence", () => {
  const observedAt = new Date("2026-09-16T10:00:00.000Z");

  it("waits two minutes before the first outage lookup", () => {
    expect(CELL_INITIAL_DELAY_MS).toBe(2 * 60 * 1_000);
    expect(getInitialCellLookupAt(observedAt).getTime()).toBe(
      observedAt.getTime() + CELL_INITIAL_DELAY_MS,
    );
  });

  it("keeps the simulator's first lookup at one normal interval", () => {
    const intervals = getCellLookupIntervals(
      { cellLookupNormalIntervalSeconds: 30, cellLookupFastIntervalSeconds: 5 } as never,
      "development",
    );
    expect(getInitialCellLookupAt(observedAt, intervals).getTime()).toBe(
      observedAt.getTime() + 30_000,
    );
  });

  it("keeps normal cadence without a previous estimate", () => {
    const result = advanceCellLookupAfterSuccess({
      mode: "normal",
      previousLatitude: null,
      previousLongitude: null,
      latitude: 26.8899185,
      longitude: 75.7769314,
      stableSampleCount: 0,
      observedAt,
    });

    expect(result.mode).toBe("normal");
    expect(result.nextLookupAt.getTime()).toBe(observedAt.getTime() + CELL_NORMAL_INTERVAL_MS);
  });

  it("enters fast mode at one kilometre or more", () => {
    const result = advanceCellLookupAfterSuccess({
      mode: "normal",
      previousLatitude: 0,
      previousLongitude: 0,
      latitude: 0.01,
      longitude: 0,
      stableSampleCount: 0,
      observedAt,
    });

    expect(result.distanceFromPreviousMeters).toBeGreaterThan(1_000);
    expect(result.mode).toBe("fast");
    expect(result.nextLookupAt.getTime()).toBe(observedAt.getTime() + CELL_FAST_INTERVAL_MS);
  });

  it("returns to normal after seven stable fast samples", () => {
    const result = advanceCellLookupAfterSuccess({
      mode: "fast",
      previousLatitude: 26.8899,
      previousLongitude: 75.7769,
      latitude: 26.88991,
      longitude: 75.77691,
      stableSampleCount: 6,
      observedAt,
    });

    expect(result.mode).toBe("normal");
    expect(result.stableSampleCount).toBe(0);
    expect(result.nextLookupAt.getTime()).toBe(observedAt.getTime() + CELL_NORMAL_INTERVAL_MS);
  });

  it("resets stability when fast-mode movement reaches the threshold", () => {
    const result = advanceCellLookupAfterSuccess({
      mode: "fast",
      previousLatitude: 0,
      previousLongitude: 0,
      latitude: 0.01,
      longitude: 0,
      stableSampleCount: 6,
      observedAt,
    });

    expect(result.mode).toBe("fast");
    expect(result.stableSampleCount).toBe(0);
  });
});

describe("development cell lookup policy", () => {
  const observedAt = new Date("2026-09-16T10:00:00.000Z");
  const cellular = {
    radioType: "lte" as const,
    duplexMode: "fdd" as const,
    towers: [{
      role: "serving" as const,
      mobileCountryCode: 404,
      mobileNetworkCode: 70,
      trackingAreaCode: 1660,
      cellId: 232213794,
      physicalCellId: 216,
      band: "LTE BAND 1",
      earfcn: 515,
      rxDbm: -89,
      txDbm: 0,
      rsrpDbm: -97,
      rsrqDb: -5,
      sinrDb: 14,
    }],
  };
  const eligible = {
    nodeEnv: "development" as const,
    simulation: undefined,
    gpsConnected: false,
    enabled: true,
    cellular,
  };

  it("allows each ordinary development observation, including the first", () => {
    expect(shouldLookupEveryCellObservation(eligible)).toBe(true);
    expect(isCellLookupDue({
      lookupEveryObservation: true,
      nextLookupAt: new Date(observedAt.getTime() + CELL_NORMAL_INTERVAL_MS),
      leaseUntil: null,
      observedAt,
    })).toBe(true);
    expect(isCellLookupDue({
      lookupEveryObservation: true,
      nextLookupAt: new Date(observedAt.getTime() + CELL_NORMAL_INTERVAL_MS),
      leaseUntil: null,
      observedAt: new Date(observedAt.getTime() + 5_000),
    })).toBe(true);
  });

  it("keeps the in-flight lease and scheduled production cadence", () => {
    const nextLookupAt = new Date(observedAt.getTime() + CELL_NORMAL_INTERVAL_MS);
    const leaseUntil = new Date(observedAt.getTime() + 15_000);
    expect(isCellLookupDue({ lookupEveryObservation: true, nextLookupAt, leaseUntil, observedAt })).toBe(false);
    expect(isCellLookupDue({ lookupEveryObservation: false, nextLookupAt, leaseUntil: null, observedAt })).toBe(false);
    expect(isCellLookupDue({ lookupEveryObservation: false, nextLookupAt, leaseUntil: null, observedAt: nextLookupAt })).toBe(true);
  });

  it("does not look up a GPS-valid payload or one without a serving tower", () => {
    expect(shouldLookupEveryCellObservation({ ...eligible, gpsConnected: true })).toBe(false);
    expect(shouldLookupEveryCellObservation({ ...eligible, cellular: null })).toBe(false);
  });

  it("leaves production and explicit simulator cadence unchanged", () => {
    expect(shouldLookupEveryCellObservation({ ...eligible, nodeEnv: "production" })).toBe(false);
    expect(shouldLookupEveryCellObservation({
      ...eligible,
      simulation: {
        cellLookupNormalIntervalSeconds: 10,
        cellLookupFastIntervalSeconds: 2,
      },
    })).toBe(false);
    expect(shouldLookupEveryCellObservation({ ...eligible, enabled: false })).toBe(false);
  });
});
