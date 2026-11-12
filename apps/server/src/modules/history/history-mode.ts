import type { HistoryModeConfidence, HistoryTripMode } from "@stepwhere/types";

import {
  MODE_MIN_DISTANCE_METERS,
  MODE_MIN_DURATION_SECONDS,
  VEHICLE_HIGH_SPEED_KMH,
  VEHICLE_MAX_STEP_RATE_PER_MINUTE,
  VEHICLE_MIN_MEDIAN_SPEED_KMH,
  WALK_MAX_MEDIAN_SPEED_KMH,
  WALK_MIN_STEP_RATE_PER_MINUTE,
} from "./history.constants";
import { calculateDistanceMeters, elapsedSeconds, segmentSpeedKmh, type AcceptedHistorySample } from "./history-path";

export type HistoryModeResult = {
  mode: HistoryTripMode;
  confidence: HistoryModeConfidence | null;
};

export function inferTripMode(samples: AcceptedHistorySample[], distanceMeters = calculateDistanceMeters(samples)): HistoryModeResult {
  const first = samples[0];
  const last = samples[samples.length - 1];

  if (!first || !last) {
    return { mode: "unknown", confidence: null };
  }

  const durationSeconds = elapsedSeconds(first.occurredAt, last.occurredAt);

  if (durationSeconds < MODE_MIN_DURATION_SECONDS || distanceMeters < MODE_MIN_DISTANCE_METERS) {
    return { mode: "unknown", confidence: "low" };
  }

  const speeds = samples.slice(1).map((sample, index) => segmentSpeedKmh(samples[index]!, sample)).sort((a, b) => a - b);
  const medianSpeed = quantile(speeds, 0.5);
  const p90Speed = quantile(speeds, 0.9);
  const stepDelta = Math.max(0, last.stepCounter - first.stepCounter);
  const stepRate = stepDelta / (durationSeconds / 60);

  if (p90Speed >= VEHICLE_HIGH_SPEED_KMH || (medianSpeed >= VEHICLE_MIN_MEDIAN_SPEED_KMH && stepRate < VEHICLE_MAX_STEP_RATE_PER_MINUTE)) {
    return {
      mode: "vehicle",
      confidence: p90Speed >= VEHICLE_HIGH_SPEED_KMH && stepRate < VEHICLE_MAX_STEP_RATE_PER_MINUTE ? "high" : "medium",
    };
  }

  if (medianSpeed <= WALK_MAX_MEDIAN_SPEED_KMH && stepRate >= WALK_MIN_STEP_RATE_PER_MINUTE) {
    return {
      mode: "walking",
      confidence: medianSpeed <= 7 ? "high" : "medium",
    };
  }

  return { mode: "unknown", confidence: "low" };
}

function quantile(values: number[], q: number) {
  if (values.length === 0) {
    return 0;
  }

  const index = Math.min(values.length - 1, Math.max(0, Math.ceil(values.length * q) - 1));
  return values[index]!;
}
