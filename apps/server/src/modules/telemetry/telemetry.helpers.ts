import {
  TELEMETRY_OFFLINE_AFTER_MS,
  TELEMETRY_STALE_AFTER_MS,
  type ChildConnectivityDto,
  type ChildTelemetryState,
  type ChildTrackingStatus,
  type GsmConnectionState,
} from "@stepwhere/types";

export function deriveStepDelta(previousCounter: number | null | undefined, currentCounter: number) {
  if (previousCounter === null || previousCounter === undefined) {
    return currentCounter;
  }

  if (currentCounter >= previousCounter) {
    return currentCounter - previousCounter;
  }

  return currentCounter;
}

/**
 * Fastest sustained cadence we will believe from a tracker, per second. Elite
 * sprinters peak near 5/s; 5 gives headroom over a running child while still
 * catching garbage.
 */
export const MAX_PLAUSIBLE_STEPS_PER_SECOND = 5;
/**
 * Credit for the very first sample, or the first after a counter reset, when there
 * is no trustworthy elapsed window to scale against. Roughly an hour of walking.
 */
export const MAX_UNMEASURED_STEP_CREDIT = 5_000;

/**
 * Bounds a raw step delta to something physically possible.
 *
 * The raw derivation credits the *entire* counter when a device reboots, so a
 * tracker that resets at 40,000 would otherwise book 40,000 steps in one interval.
 * That was previously unclamped, and it becomes far more visible now that today's
 * total updates live rather than being buried in a daily aggregate.
 */
export function clampStepDelta(input: {
  rawDelta: number;
  elapsedSeconds: number | null;
  isCounterReset: boolean;
}) {
  if (!Number.isFinite(input.rawDelta) || input.rawDelta <= 0) {
    return 0;
  }

  const delta = Math.floor(input.rawDelta);

  // With no measurable window (first sample, or a reset) we cannot scale by time,
  // so fall back to a flat credit ceiling.
  if (
    input.isCounterReset
    || input.elapsedSeconds === null
    || !Number.isFinite(input.elapsedSeconds)
    || input.elapsedSeconds <= 0
  ) {
    return Math.min(delta, MAX_UNMEASURED_STEP_CREDIT);
  }

  const ceiling = Math.ceil(input.elapsedSeconds * MAX_PLAUSIBLE_STEPS_PER_SECOND);

  return Math.min(delta, ceiling);
}

export function isStepCounterReset(
  previousCounter: number | null | undefined,
  currentCounter: number,
) {
  if (previousCounter === null || previousCounter === undefined) {
    return false;
  }

  return currentCounter < previousCounter;
}

export function getHourBucketStart(date: Date) {
  const bucket = new Date(date);
  bucket.setUTCMinutes(0, 0, 0);
  return bucket;
}

export function deriveConnectivityState(input: {
  deviceStatus?: "fresh" | "active" | "inactive" | "blocked" | null;
  lastDeviceState?: "active" | "sleep" | "offline" | null;
  lastGpsConnected?: boolean | null;
  lastGpsFixAt?: Date | null;
  lastSeenAt?: Date | null;
}, now = new Date()): ChildConnectivityDto {
  const lastSeenAt = input.lastSeenAt ?? null;
  let gsmState: GsmConnectionState;

  if (
    input.deviceStatus === "blocked"
    || input.lastDeviceState === "offline"
    || !lastSeenAt
  ) {
    gsmState = "offline";
  } else {
    const packetAgeMs = Math.max(0, now.getTime() - lastSeenAt.getTime());
    gsmState = packetAgeMs > TELEMETRY_OFFLINE_AFTER_MS
      ? "offline"
      : packetAgeMs > TELEMETRY_STALE_AFTER_MS
        ? "stale"
        : "connected";
  }

  const lastGpsFixAt = input.lastGpsFixAt ?? null;
  const gpsState = gsmState === "offline"
    ? "offline"
    : gsmState === "stale"
      ? "stale"
      : input.lastGpsConnected
        ? "connected"
        : "acquiring";

  return {
    gsmState,
    gpsState,
    lastGpsFixAt: lastGpsFixAt?.toISOString() ?? null,
  };
}

export function deriveTelemetryState(input: {
  lastSeenAt?: Date | null;
  lastDeviceState?: "active" | "sleep" | "offline" | null;
  status?: ChildTrackingStatus | null;
  statusLabel?: string | null;
}, now = new Date()): {
  status: ChildTrackingStatus;
  statusLabel: string;
  telemetryState: ChildTelemetryState;
} {
  const lastSeenAt = input.lastSeenAt ?? null;

  if (input.lastDeviceState === "offline") {
    return {
      status: "offline",
      statusLabel: "Offline",
      telemetryState: "offline",
    };
  }

  if (input.lastDeviceState === "sleep") {
    return {
      status: input.status && input.status !== "offline" ? input.status : "safe",
      statusLabel: "Sleep",
      telemetryState: "sleep",
    };
  }

  if (!lastSeenAt) {
    return {
      status: "offline",
      statusLabel: "Connecting",
      telemetryState: "connecting",
    };
  }

  const ageMs = now.getTime() - lastSeenAt.getTime();

  if (ageMs > TELEMETRY_OFFLINE_AFTER_MS) {
    return {
      status: "offline",
      statusLabel: "Offline",
      telemetryState: "offline",
    };
  }

  if (ageMs > TELEMETRY_STALE_AFTER_MS) {
    return {
      status: "offline",
      statusLabel: "Connecting",
      telemetryState: "connecting",
    };
  }

  return {
    status: input.status ?? "safe",
    statusLabel: input.statusLabel ?? "Online",
    telemetryState: "active",
  };
}
