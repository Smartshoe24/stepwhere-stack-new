import type {
  CellularTelemetryInput,
  TelemetrySimulationInput,
  WifiTelemetryInput,
} from "@stepwhere/types";

import { haversineDistanceMeters } from "../geofences/geofence-distance";
import { getEligibleWifiAccessPoints } from "./wifi-geolocation";

// First Wi-Fi/cell lookup this long after GPS is lost: soon enough that a
// still tracker (it sleeps after ~5 min without steps) gets a position first.
export const CELL_INITIAL_DELAY_MS = 2 * 60 * 1_000;
export const CELL_NORMAL_INTERVAL_MS = 7 * 60 * 1_000;
// A changed serving cell or Wi-Fi set brings the next lookup forward, but not
// sooner than this after the previous one.
export const NETWORK_CHANGE_MIN_INTERVAL_MS = 30 * 1_000;
// Serving cells of recent lookups. A still tracker often flips between two or
// three neighbouring towers; returning to one of these is not a move.
export const NETWORK_RECENT_CELL_COUNT = 4;
const NETWORK_WIFI_KEEP = 10;
// Below this share of common access points the Wi-Fi set counts as changed.
const NETWORK_WIFI_MIN_OVERLAP = 0.5;
export const CELL_FAST_INTERVAL_MS = 60 * 1_000;
export const CELL_LOOKUP_LEASE_MS = 15_000;
export const CELL_MOVEMENT_THRESHOLD_METERS = 1_000;
export const CELL_STABLE_SAMPLE_TARGET = 7;

export type CellLookupMode = "normal" | "fast";

export type CellLookupIntervals = {
  initialDelayMs: number;
  normalIntervalMs: number;
  fastIntervalMs: number;
};

export const DEFAULT_CELL_LOOKUP_INTERVALS: CellLookupIntervals = {
  initialDelayMs: CELL_INITIAL_DELAY_MS,
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

  // The simulator keeps its own cadence: the first lookup after one normal interval.
  return {
    initialDelayMs: simulation.cellLookupNormalIntervalSeconds * 1_000,
    normalIntervalMs: simulation.cellLookupNormalIntervalSeconds * 1_000,
    fastIntervalMs: simulation.cellLookupFastIntervalSeconds * 1_000,
  };
}

// Bench test devices (NETWORK_LOOKUP_TEST_DEVICES): the usual 2-minute first
// lookup, then every 30 s whether or not anything changed.
export const TEST_DEVICE_CELL_LOOKUP_INTERVALS: CellLookupIntervals = {
  initialDelayMs: CELL_INITIAL_DELAY_MS,
  normalIntervalMs: NETWORK_CHANGE_MIN_INTERVAL_MS,
  fastIntervalMs: NETWORK_CHANGE_MIN_INTERVAL_MS,
};

export function getInitialCellLookupAt(
  outageStartedAt: Date,
  intervals = DEFAULT_CELL_LOOKUP_INTERVALS,
) {
  return new Date(outageStartedAt.getTime() + intervals.initialDelayMs);
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

/** "mcc-mnc-tac-cellId" of the serving tower, or null. */
export function servingCellKey(cellular: CellularTelemetryInput | null | undefined) {
  const tower = cellular?.towers.find((candidate) => candidate.role === "serving");
  if (!tower) return null;
  return `${tower.mobileCountryCode}-${tower.mobileNetworkCode}-${tower.trackingAreaCode}-${tower.cellId}`;
}

/** BSSIDs of the strongest usable access points (empty below the 2 a lookup needs). */
export function wifiLookupKeys(wifi: WifiTelemetryInput | null | undefined) {
  const points = getEligibleWifiAccessPoints(wifi);
  return points.length >= 2 ? points.slice(0, NETWORK_WIFI_KEEP).map((point) => point.macAddress) : [];
}

/** Recent serving cells with the newest first, for the snapshot after a lookup. */
export function nextRecentCells(previous: readonly string[] | null | undefined, cell: string | null) {
  const kept = (previous ?? []).filter((key) => key !== cell);
  return (cell ? [cell, ...kept] : kept).slice(0, NETWORK_RECENT_CELL_COUNT);
}

/**
 * True when the tracker now sees a serving cell none of the recent lookups
 * used, or a usable Wi-Fi set that shares less than half its access points
 * with the last lookup's. A missing Wi-Fi scan is never a change: scans fail
 * now and then while the tracker stands still.
 */
export function hasNetworkObservationChanged(input: {
  recentCells: readonly string[] | null | undefined;
  lastWifi: readonly string[] | null | undefined;
  cellular: CellularTelemetryInput | null | undefined;
  wifi: WifiTelemetryInput | null | undefined;
}) {
  const cell = hasUsableCellObservation(input.cellular) ? servingCellKey(input.cellular) : null;
  if (cell && !(input.recentCells ?? []).includes(cell)) return true;

  const now = wifiLookupKeys(input.wifi);
  if (now.length === 0) return false;
  const before = new Set(input.lastWifi ?? []);
  if (before.size < 2) return true;
  const common = now.filter((key) => before.has(key)).length;
  return common / Math.min(now.length, before.size) < NETWORK_WIFI_MIN_OVERLAP;
}

/** Whether a changed observation may bring the lookup forward now. */
export function shouldLookupForChangedNetwork(input: {
  lastLookupAt: Date | null | undefined;
  nextLookupAt: Date | null;
  observedAt: Date;
  changed: boolean;
}) {
  if (!input.changed || !input.lastLookupAt || !input.nextLookupAt) return false;
  if (input.nextLookupAt <= input.observedAt) return false;   // already due
  return input.observedAt.getTime() - input.lastLookupAt.getTime() >= NETWORK_CHANGE_MIN_INTERVAL_MS;
}
