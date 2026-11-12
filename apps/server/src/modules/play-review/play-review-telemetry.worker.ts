import { and, eq, isNull, lt } from "drizzle-orm";
import { formatInTimeZone } from "date-fns-tz";

import { db } from "../../db/client";
import {
  childDeviceBindings,
  childStatusSnapshots,
  children,
  devices,
  members,
  users,
} from "../../db/schema";
import { getActiveAccountDeletion, isOrganizationDeletionPending } from "../account-deletion/account-deletion.service";
import { ingestLocation } from "../telemetry/telemetry.service";
import { getPlayReviewConfiguration } from "./play-review-access.service";

const CLAIM_INTERVAL_MS = 25_000;
const PUNE_TIMEZONE = "Asia/Kolkata";
const MINUTE_MS = 60_000;
const HOME = { latitude: 18.520430, longitude: 73.856744 };
const SCHOOL = { latitude: 18.532420, longitude: 73.876010 };
const ACTIVITY = { latitude: 18.516890, longitude: 73.879310 };

type Coordinate = typeof HOME;

const ROUTE_SEGMENTS = [
  { from: HOME, to: SCHOOL, durationMs: 33 * MINUTE_MS },
  { from: SCHOOL, to: ACTIVITY, durationMs: 24 * MINUTE_MS },
  { from: ACTIVITY, to: HOME, durationMs: 33 * MINUTE_MS },
] satisfies Array<{
  from: Coordinate;
  to: Coordinate;
  durationMs: number;
}>;
const ROUTE_LOOP_DURATION_MS = ROUTE_SEGMENTS.reduce(
  (total, segment) => total + segment.durationMs,
  0,
);

function interpolate(from: Coordinate, to: Coordinate, progress: number) {
  const bounded = Math.max(0, Math.min(1, progress));
  return {
    latitude: from.latitude + (to.latitude - from.latitude) * bounded,
    longitude: from.longitude + (to.longitude - from.longitude) * bounded,
  };
}

function getRouteCoordinate(now: Date) {
  let elapsedMs = (
    (now.getTime() % ROUTE_LOOP_DURATION_MS) + ROUTE_LOOP_DURATION_MS
  ) % ROUTE_LOOP_DURATION_MS;

  for (const segment of ROUTE_SEGMENTS) {
    if (elapsedMs < segment.durationMs) {
      return interpolate(segment.from, segment.to, elapsedMs / segment.durationMs);
    }

    elapsedMs -= segment.durationMs;
  }

  return HOME;
}

function isActivityWindow(now: Date) {
  const hour = Number(formatInTimeZone(now, PUNE_TIMEZONE, "H"));
  const minute = Number(formatInTimeZone(now, PUNE_TIMEZONE, "m"));
  const minutes = hour * 60 + minute;

  return (
    (minutes >= 450 && minutes < 495)
    || (minutes >= 930 && minutes < 975)
    || (minutes >= 1035 && minutes < 1080)
  );
}

/**
 * Emits a safe, deterministic Pune route for the one explicitly provisioned
 * Apple and Google store reviewer. `force` is used once by the provisioning command so
 * the current loop position is populated immediately; scheduled runs use the
 * device row as a small cross-process lease.
 */
export async function emitPlayReviewTelemetry(input: { force?: boolean } = {}) {
  const configuration = getPlayReviewConfiguration();
  if (!configuration) {
    return false;
  }

  const [reviewer] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(
      eq(users.phoneNumber, configuration.phoneNumber),
      eq(users.email, configuration.email),
      eq(users.isPlayReviewAccount, true),
    ))
    .limit(1);
  if (!reviewer || await getActiveAccountDeletion(reviewer.id)) {
    return false;
  }

  const [binding] = await db
    .select({
      deviceId: devices.id,
      organizationId: children.organizationId,
      stepCounter: childStatusSnapshots.lastRawStepCounter,
    })
    .from(devices)
    .innerJoin(childDeviceBindings, and(
      eq(childDeviceBindings.deviceId, devices.id),
      isNull(childDeviceBindings.unboundAt),
    ))
    .innerJoin(children, eq(children.id, childDeviceBindings.childId))
    .innerJoin(members, and(
      eq(members.organizationId, children.organizationId),
      eq(members.userId, reviewer.id),
    ))
    .leftJoin(childStatusSnapshots, eq(childStatusSnapshots.childId, children.id))
    .where(and(
      eq(devices.hardwareIdentifier, configuration.hardwareIdentifier),
      eq(devices.status, "active"),
    ))
    .limit(1);
  if (!binding || await isOrganizationDeletionPending(binding.organizationId)) {
    return false;
  }

  if (!input.force) {
    const cutoff = new Date(Date.now() - CLAIM_INTERVAL_MS);
    const [claimed] = await db
      .update(devices)
      .set({ updatedAt: new Date() })
      .where(and(eq(devices.id, binding.deviceId), lt(devices.updatedAt, cutoff)))
      .returning({ id: devices.id });
    if (!claimed) {
      return false;
    }
  }

  const now = new Date();
  const coordinate = getRouteCoordinate(now);
  const activityWindow = isActivityWindow(now);
  const minuteOfDay = Number(formatInTimeZone(now, PUNE_TIMEZONE, "H")) * 60
    + Number(formatInTimeZone(now, PUNE_TIMEZONE, "m"));
  const batteryPercent = Math.max(64, 92 - Math.floor(minuteOfDay / 55));

  await ingestLocation({
    hardwareIdentifier: configuration.hardwareIdentifier,
    latitude: coordinate.latitude,
    longitude: coordinate.longitude,
    accuracyMeters: 9,
    batteryPercent,
    batteryVoltageMv: 3900 + batteryPercent * 3,
    signalStrength: 4,
    satelliteCount: 10,
    stepCounter: (binding.stepCounter ?? 12_000) + (activityWindow ? 32 : 0),
    deviceState: "active",
  });
  return true;
}
