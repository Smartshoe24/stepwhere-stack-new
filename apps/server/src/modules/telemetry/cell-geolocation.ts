import type {
  CellularTelemetryInput,
  TelemetrySimulationInput,
  WifiTelemetryInput,
} from "@stepwhere/types";

import { haversineDistanceMeters } from "../geofences/geofence-distance";
import { getEligibleWifiAccessPoints } from "./wifi-geolocation";

export const CELL_NORMAL_INTERVAL_MS = 7 * 60 * 1_000;
export const CELL_FAST_INTERVAL_MS = 60 * 1_000;
export const CELL_LOOKUP_LEASE_MS = 15_000;
export const CELL_MOVEMENT_THRESHOLD_METERS = 1_000;
export const CELL_STABLE_SAMPLE_TARGET = 7;

export type CellLookupMode = "normal" | "fast";

export type CellLookupIntervals = {
  normalIntervalMs: number;
  fastIntervalMs: number;
};

export const DEFAULT_CELL_LOOKUP_INTERVALS: CellLookupIntervals = {
  normalIntervalMs: CELL_NORMAL_INTERVAL_MS,
  fastIntervalMs: CELL_FAST_INTERVAL_MS,
};

export type CellLookupSuccessState = {
  mode: CellLookupMode;
  nextLookupAt: Date;
  stableSampleCount: number;
  distanceFromPreviousMeters: number | null;
};

export function getCellLookupIntervals(
  simulation: TelemetrySimulationInput | undefined,
  nodeEnv: "development" | "test" | "production",
): CellLookupIntervals {
  if (!simulation || nodeEnv === "production") {
    return DEFAULT_CELL_LOOKUP_INTERVALS;
  }

  return {
    normalIntervalMs: simulation.cellLookupNormalIntervalSeconds * 1_000,
    fastIntervalMs: simulation.cellLookupFastIntervalSeconds * 1_000,
  };
}

export function getInitialCellLookupAt(
  outageStartedAt: Date,
  intervals = DEFAULT_CELL_LOOKUP_INTERVALS,
) {
  return new Date(outageStartedAt.getTime() + intervals.normalIntervalMs);
}

export function hasUsableCellObservation(
  cellular: CellularTelemetryInput | null | undefined,
): cellular is CellularTelemetryInput {
  if (!cellular || cellular.radioType !== "lte") {
    return false;
  }

  return cellular.towers.filter((tower) => tower.role === "serving").length === 1;
}

export function hasUsableNetworkObservation(
  cellular: CellularTelemetryInput | null | undefined,
  wifi: WifiTelemetryInput | null | undefined,
) {
  return hasUsableCellObservation(cellular) || getEligibleWifiAccessPoints(wifi).length >= 2;
}

export function shouldLookupEveryCellObservation(input: {
  nodeEnv: "development" | "test" | "production";
  simulation: TelemetrySimulationInput | undefined;
  gpsConnected: boolean;
  enabled: boolean;
  cellular: CellularTelemetryInput | null | undefined;
  wifi?: WifiTelemetryInput | null;
}) {
  return input.nodeEnv === "development"
    && !input.simulation
    && !input.gpsConnected
    && input.enabled
    && hasUsableNetworkObservation(input.cellular, input.wifi);
}

export function isCellLookupDue(input: {
  lookupEveryObservation: boolean;
  nextLookupAt: Date | null;
  leaseUntil: Date | null;
  observedAt: Date;
}) {
  return (input.lookupEveryObservation
    || (input.nextLookupAt != null && input.nextLookupAt <= input.observedAt))
    && (!input.leaseUntil || input.leaseUntil <= input.observedAt);
}

export function advanceCellLookupAfterSuccess(input: {
  mode: CellLookupMode;
  previousLatitude: number | null;
  previousLongitude: number | null;
  latitude: number;
  longitude: number;
  stableSampleCount: number;
  observedAt: Date;
  intervals?: CellLookupIntervals;
}): CellLookupSuccessState {
  const intervals = input.intervals ?? DEFAULT_CELL_LOOKUP_INTERVALS;
  const hasPrevious = input.previousLatitude != null && input.previousLongitude != null;
  const distanceFromPreviousMeters = hasPrevious
    ? haversineDistanceMeters({
      fromLatitude: input.previousLatitude!,
      fromLongitude: input.previousLongitude!,
      toLatitude: input.latitude,
      toLongitude: input.longitude,
    })
    : null;

  if (input.mode === "normal") {
    const moved = distanceFromPreviousMeters != null
      && distanceFromPreviousMeters >= CELL_MOVEMENT_THRESHOLD_METERS;

    return {
      mode: moved ? "fast" : "normal",
      nextLookupAt: new Date(
        input.observedAt.getTime()
        + (moved ? intervals.fastIntervalMs : intervals.normalIntervalMs),
      ),
      stableSampleCount: 0,
      distanceFromPreviousMeters,
    };
  }

  const stable = distanceFromPreviousMeters != null
    && distanceFromPreviousMeters < CELL_MOVEMENT_THRESHOLD_METERS;
  const stableSampleCount = stable ? input.stableSampleCount + 1 : 0;
  const shouldReturnToNormal = stableSampleCount >= CELL_STABLE_SAMPLE_TARGET;

  return {
    mode: shouldReturnToNormal ? "normal" : "fast",
    nextLookupAt: new Date(
      input.observedAt.getTime()
      + (shouldReturnToNormal ? intervals.normalIntervalMs : intervals.fastIntervalMs),
    ),
    stableSampleCount: shouldReturnToNormal ? 0 : stableSampleCount,
    distanceFromPreviousMeters,
  };
}
