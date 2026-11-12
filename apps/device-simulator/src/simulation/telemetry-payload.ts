import type {
  CellularTelemetryInput,
  CellularTowerTelemetryInput,
  LocationTelemetryInput,
} from "@stepwhere/types";

import type { DeviceState, PersistedSimulatorState, Waypoint } from "./simulator-state";

type CellularParseResult =
  | { data: CellularTelemetryInput; error: null }
  | { data: null; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isIntegerInRange(value: unknown, minimum: number, maximum: number) {
  return typeof value === "number"
    && Number.isInteger(value)
    && value >= minimum
    && value <= maximum;
}

function isOptionalNumberInRange(value: unknown, minimum: number, maximum: number) {
  return value === undefined
    || value === null
    || (typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum);
}

function isOptionalInteger(value: unknown, minimum: number, maximum: number) {
  return value === undefined || value === null || isIntegerInRange(value, minimum, maximum);
}

function validateTower(value: unknown, index: number): string | null {
  if (!isRecord(value)) {
    return `Tower ${index + 1} must be a JSON object.`;
  }

  if (value.role !== "serving" && value.role !== "neighbor") {
    return `Tower ${index + 1} role must be "serving" or "neighbor".`;
  }

  const requiredIntegers: Array<[string, number, number]> = [
    ["mobileCountryCode", 0, 999],
    ["mobileNetworkCode", 0, 999],
    ["trackingAreaCode", 0, 65_535],
    ["cellId", 0, 268_435_455],
  ];

  for (const [field, minimum, maximum] of requiredIntegers) {
    if (!isIntegerInRange(value[field], minimum, maximum)) {
      return `Tower ${index + 1} ${field} must be an integer from ${minimum} to ${maximum}.`;
    }
  }

  if (!isOptionalInteger(value.physicalCellId, 0, 503)) {
    return `Tower ${index + 1} physicalCellId must be an integer from 0 to 503.`;
  }

  if (!isOptionalInteger(value.earfcn, 0, Number.MAX_SAFE_INTEGER)) {
    return `Tower ${index + 1} earfcn must be a non-negative integer.`;
  }

  if (
    value.band !== undefined
    && value.band !== null
    && (typeof value.band !== "string" || value.band.trim().length > 40)
  ) {
    return `Tower ${index + 1} band must be a string of at most 40 characters.`;
  }

  const optionalMeasurements: Array<[string, number, number]> = [
    ["rxDbm", -200, 100],
    ["txDbm", -200, 100],
    ["rsrpDbm", -200, 100],
    ["rsrqDb", -100, 100],
    ["sinrDb", -100, 100],
  ];

  for (const [field, minimum, maximum] of optionalMeasurements) {
    if (!isOptionalNumberInRange(value[field], minimum, maximum)) {
      return `Tower ${index + 1} ${field} must be from ${minimum} to ${maximum}.`;
    }
  }

  return null;
}

export function parseCellularTelemetryJson(payloadJson: string): CellularParseResult {
  let parsed: unknown;

  try {
    parsed = JSON.parse(payloadJson);
  } catch {
    return { data: null, error: "Cellular profile must contain valid JSON." };
  }

  if (!isRecord(parsed)) {
    return { data: null, error: "Cellular profile must be a JSON object." };
  }

  if (parsed.radioType !== "lte") {
    return { data: null, error: "radioType must be \"lte\"." };
  }

  if (
    parsed.duplexMode !== undefined
    && parsed.duplexMode !== null
    && parsed.duplexMode !== "fdd"
    && parsed.duplexMode !== "tdd"
  ) {
    return { data: null, error: "duplexMode must be \"fdd\", \"tdd\", or null." };
  }

  if (!Array.isArray(parsed.towers) || parsed.towers.length < 1 || parsed.towers.length > 16) {
    return { data: null, error: "Cellular profile must contain 1 to 16 towers." };
  }

  for (const [index, tower] of parsed.towers.entries()) {
    const error = validateTower(tower, index);
    if (error) {
      return { data: null, error };
    }
  }

  if (parsed.towers.filter((tower) => (tower as CellularTowerTelemetryInput).role === "serving").length !== 1) {
    return { data: null, error: "Cellular profile must contain exactly one serving tower." };
  }

  return { data: parsed as CellularTelemetryInput, error: null };
}

export function getSimulationTimingError(settings: PersistedSimulatorState) {
  if (!settings.enableCellLookupTimingOverride) {
    return null;
  }

  if (
    !Number.isInteger(settings.cellLookupNormalIntervalSeconds)
    || settings.cellLookupNormalIntervalSeconds < 1
    || settings.cellLookupNormalIntervalSeconds > 420
  ) {
    return "Normal cell lookup interval must be an integer from 1 to 420 seconds.";
  }

  if (
    !Number.isInteger(settings.cellLookupFastIntervalSeconds)
    || settings.cellLookupFastIntervalSeconds < 1
    || settings.cellLookupFastIntervalSeconds > 60
  ) {
    return "Fast cell lookup interval must be an integer from 1 to 60 seconds.";
  }

  if (settings.cellLookupFastIntervalSeconds > settings.cellLookupNormalIntervalSeconds) {
    return "Fast cell lookup interval cannot exceed the normal interval.";
  }

  return null;
}

export function buildTelemetryPayload(input: {
  currentPosition: Waypoint | null;
  deviceState: DeviceState;
  runtimeBatteryPercent: number;
  runtimeBatteryVoltageMv: number;
  runtimeSatelliteCount: number;
  runtimeSignalStrength: number;
  runtimeStepCounter: number;
  settings: PersistedSimulatorState;
  cellular: CellularTelemetryInput;
}): LocationTelemetryInput | null {
  if (!input.currentPosition) {
    return null;
  }

  const satelliteCount = Math.max(0, Math.round(input.runtimeSatelliteCount));
  const gpsFixValid = input.settings.gpsEnabled && satelliteCount >= 3;

  return {
    hardwareIdentifier: input.settings.hardwareIdentifier.trim(),
    latitude: Number(input.currentPosition.latitude.toFixed(6)),
    longitude: Number(input.currentPosition.longitude.toFixed(6)),
    gpsFixValid,
    cellular: input.cellular,
    simulation: input.settings.enableCellLookupTimingOverride
      ? {
        cellLookupNormalIntervalSeconds: input.settings.cellLookupNormalIntervalSeconds,
        cellLookupFastIntervalSeconds: input.settings.cellLookupFastIntervalSeconds,
      }
      : undefined,
    accuracyMeters: gpsFixValid ? 5 : null,
    batteryPercent: Math.round(input.runtimeBatteryPercent),
    batteryVoltageMv: Math.round(input.runtimeBatteryVoltageMv),
    signalStrength: Math.round(input.runtimeSignalStrength),
    satelliteCount: gpsFixValid ? satelliteCount : 0,
    stepCounter: Math.max(0, Math.round(input.runtimeStepCounter)),
    deviceState: input.deviceState,
  };
}
