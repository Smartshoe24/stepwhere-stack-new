import { DEFAULT_BATTERY_DRAIN_PER_MINUTE } from "./simulator-state";

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function deriveBatteryVoltageMv(percent: number) {
  return Math.round(3300 + (clamp(percent, 0, 100) / 100) * 900);
}

export function applyBatteryDrain(input: {
  batteryPercent: number;
  elapsedSeconds: number;
  drainPerMinute?: number;
}) {
  const drainPerMinute = input.drainPerMinute ?? DEFAULT_BATTERY_DRAIN_PER_MINUTE;
  const next = input.batteryPercent - (drainPerMinute * input.elapsedSeconds) / 60;
  return clamp(next, 0, 100);
}

export function applySignalJitter(signalStrength: number) {
  return clamp(signalStrength + randomInteger(-1, 1), 0, 5);
}

export function applySatelliteJitter(satelliteCount: number) {
  return clamp(satelliteCount + randomInteger(-2, 2), 0, 32);
}

export function getStepDeltaFromDistance(distanceMeters: number, strideLengthMeters: number) {
  if (strideLengthMeters <= 0) {
    return 0;
  }

  return Math.max(0, Math.floor(distanceMeters / strideLengthMeters));
}

function randomInteger(minimum: number, maximum: number) {
  const low = Math.ceil(minimum);
  const high = Math.floor(maximum);
  return Math.floor(Math.random() * (high - low + 1)) + low;
}
