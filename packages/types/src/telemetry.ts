import type { ChildSummaryDto } from "./children";
import type { PaginatedResponse } from "./common";

/** Existing mobile freshness policy, shared so server and admin cannot drift. */
export const TELEMETRY_STALE_AFTER_MS = 60 * 1_000;
export const TELEMETRY_OFFLINE_AFTER_MS = 5 * 60 * 1_000;

export type LocationSource = "gps" | "cell" | "network";

export type WifiAccessPointTelemetryInput = {
  macAddress: string;
  signalStrengthDbm: number;
  channel: number;
  ageMs: number;
};

export type WifiTelemetryInput = {
  accessPoints: WifiAccessPointTelemetryInput[];
};

export type CellularTowerTelemetryInput = {
  role: "serving" | "neighbor";
  mobileCountryCode: number;
  mobileNetworkCode: number;
  trackingAreaCode: number;
  cellId: number;
  physicalCellId?: number | null;
  band?: string | null;
  earfcn?: number | null;
  rxDbm?: number | null;
  txDbm?: number | null;
  rsrpDbm?: number | null;
  rsrqDb?: number | null;
  sinrDb?: number | null;
};

export type CellularTelemetryInput = {
  radioType: "lte";
  duplexMode?: "fdd" | "tdd" | null;
  towers: CellularTowerTelemetryInput[];
};

export type TelemetrySimulationInput = {
  cellLookupNormalIntervalSeconds: number;
  cellLookupFastIntervalSeconds: number;
};

export type WifiModemStateDebugInput = {
  capturedAtUptimeMs: number;
  cfun: number | null;
  registrationStatus: number | null;
  dataConnected: boolean | null;
  gprsIp: string | null;
};

export type WifiExperimentStageDebugInput = {
  status: "not_started" | "running" | "success" | "no_results" | "command_failed" | "parse_failed" | "timeout" | "skipped" | "aborted";
  skipReason: string | null;
  startedAtUptimeMs: number | null;
  scanStartedAtUptimeMs: number | null;
  durationMs: number | null;
  observedAccessPointCount: number;
  retainedAccessPointCount: number;
  commandGapMs: number | null;
  modemState: WifiModemStateDebugInput | null;
  batteryBeforeMv: number | null;
  batteryAfterMv: number | null;
  rawResponse: string | null;
  rawResponseTruncated: boolean;
  error: string | null;
};

export type WifiExperimentDebugInput = {
  experimentVersion: 1;
  modemRevision: string | null;
  mcuResetFlags: number;
  state: "not_started" | "running" | "completed" | "completed_with_skips" | "aborted";
  gpsDisabled: boolean;
  sleepSuppressed: boolean;
  awakeUntilUptimeMs: number | null;
  stages: {
    disconnected: WifiExperimentStageDebugInput;
    connected_before_cell: WifiExperimentStageDebugInput;
    connected_after_cell: WifiExperimentStageDebugInput;
    connected_after_cell_quiet: WifiExperimentStageDebugInput;
  };
};

export type WifiExperimentSummaryStageDebugInput = Pick<
  WifiExperimentStageDebugInput,
  "status" | "skipReason" | "durationMs" | "observedAccessPointCount"
  | "retainedAccessPointCount" | "commandGapMs" | "error"
>;

export type WifiExperimentSummaryDebugInput = {
  modemRevision: string | null;
  mcuResetFlags: number;
  state: WifiExperimentDebugInput["state"];
  stages: Record<keyof WifiExperimentDebugInput["stages"], WifiExperimentSummaryStageDebugInput>;
};

export type TelemetryDebugInput = {
  firmwareVersion: string;
  uptimeMs: number;
  system: {
    ready: boolean;
    modemPowered: boolean;
    imeiValid: boolean;
    gprsConnected: boolean;
    gpsReady: boolean;
    accelerometerReady: boolean;
  };
  modem: { gprsIp: string | null };
  gps: {
    locationValid: boolean;
    fixAgeMs?: number | null;
    satellitesValid: boolean;
    satellites: number | null;
    speedKmph: number | null;
    altitudeMeters: number | null;
    utc: string | null;
    charactersProcessed: number;
    sentencesWithFix: number;
    failedChecksum: number;
  };
  power: {
    batteryAdcRaw: number;
    vrefAdcRaw: number;
    vddaMv: number | null;
    batteryVoltageMv: number;
    batteryPercent: number;
    chargeStatus: "unknown" | "charging" | "complete" | "error" | "idle";
    lowBattery: boolean;
  };
  activity: {
    stepsThisMinute: number;
    pendingSteps: number;
    totalSteps: number;
    minuteCounter: number;
    active: boolean;
    sleepMode: boolean;
    sleepMinuteCount: number;
    lastActiveAgoMs: number;
  };
  cellQuery: {
    status: "success" | "skipped_gps_fix" | "command_failed" | "parse_failed";
    rawResponse: string | null;
    error: string | null;
  };
  wifiScan?: {
    status: "success" | "no_results" | "skipped_gps_fix" | "skipped_cooldown" | "skipped_backoff" | "command_failed" | "parse_failed" | "timeout";
    durationMs: number | null;
    accessPointCount: number;
    rawResponse: string | null;
    rawResponseTruncated: boolean;
    error: string | null;
    modemState?: WifiModemStateDebugInput | null;
    attempts?: number;
    quietMs?: number | null;
  };
  wifiExperiment?: WifiExperimentDebugInput;
  wifiExperimentSummary?: WifiExperimentSummaryDebugInput;
  http: {
    previousResult: "not_attempted" | "accepted" | "http_error" | "transport_error";
    previousFailureReason?: "payload_rejected" | null;
    previousStatusCode: number | null;
    previousDurationMs: number | null;
    previousBodyBytes?: number | null;
    bodyLimitBytes?: number;
    payloadDetail?: "full" | "compact";
    consecutiveFailures: number;
  };
};

export type ResolvedPositionDto = {
  latitude: number;
  longitude: number;
  source: LocationSource;
  accuracyMeters: number | null;
  observedAt: string;
};

export type LocationTelemetryInput = {
  hardwareIdentifier: string;
  latitude: number;
  longitude: number;
  gpsFixValid?: boolean;
  cellular?: CellularTelemetryInput | null;
  wifi?: WifiTelemetryInput | null;
  /** Development-only simulator controls. Production servers ignore this field. */
  simulation?: TelemetrySimulationInput;
  /** Current firmware diagnostics, accepted for development inspection only. */
  debug?: TelemetryDebugInput;
  accuracyMeters?: number | null;
  batteryPercent?: number | null;
  batteryVoltageMv?: number | null;
  signalStrength?: number | null;
  satelliteCount?: number | null;
  stepCounter: number;
  deviceState?: "active" | "sleep" | "offline";
};

export type StepTelemetryInput = {
  eventDate: string;
  stepCount: number;
};

export type LocationHistoryItemDto = {
  id: string;
  childId: string;
  latitude: number;
  longitude: number;
  source: LocationSource;
  locationLabel: string | null;
  accuracyMeters: number | null;
  batteryPercent: number | null;
  batteryVoltageMv: number | null;
  signalStrength: number | null;
  satelliteCount: number | null;
  stepCounter: number;
  deviceState: "active" | "sleep" | "offline";
  occurredAt: string;
  ingestedAt: string;
};

export type ChildTrailPointDto = {
  latitude: number;
  longitude: number;
  occurredAt: string;
  distanceFromLatestMeters: number;
};

export type ChildTrailSegmentDto = {
  source: "filtered" | "roads";
  points: ChildTrailPointDto[];
};

export type ChildTrailGeometrySource = "filtered" | "roads" | "hybrid";
export type ChildTrailGeometryRequestMode = "filtered" | "roads";

export type ChildLiveResponseDto = {
  child: ChildSummaryDto;
};

export type LocationHistoryResponseDto = PaginatedResponse<LocationHistoryItemDto>;

export type ChildTrailResponseDto = {
  childId: string;
  distanceMeters: number;
  generatedAt: string;
  geometrySource: ChildTrailGeometrySource;
  segments: ChildTrailSegmentDto[];
  points: ChildTrailPointDto[];
};
