import { and, desc, eq, isNull, lt, ne, or, sql } from "drizzle-orm";
import type {
  ActivitySteppedEventDto,
  ChildTrailGeometryRequestMode,
  ChildLiveResponseDto,
  ChildTrailResponseDto,
  LocationHistoryResponseDto,
  LocationTelemetryInput,
  StepTelemetryInput,
} from "@stepwhere/types";
import { formatInTimeZone } from "date-fns-tz";

import { env } from "../../config/env";
import { db } from "../../db/client";
import {
  childDeviceBindings,
  childActivityMinuteBuckets,
  childGeofences,
  childStatusSnapshots,
  childStepCountsHourly,
  childTrailGeometryCache,
  children,
  cellLocationEstimates,
  devices,
  locationEvents,
  stepCountsDaily,
} from "../../db/schema";
import { AppError, notFound } from "../../shared/errors";
import { getActiveSubscriptionForChild } from "../plans/plans.service";
import { realtimeRegistry } from "../realtime/realtime.service";
import { logRealtimeDebug } from "../realtime/realtime.debug";
import { toChildSummaryDto } from "../children/children.mapper";
import { toNumberOrNull } from "../../shared/mappers";
import { normalizeHardwareIdentifier } from "../devices/devices.service";
import { publicShareRealtimeRegistry } from "../shares/share-realtime.service";
import { adminRealtimeRegistry } from "../admin/admin-realtime.service";
import { toPublicShareChildDto } from "../shares/shares.mapper";
import {
  clampStepDelta,
  deriveStepDelta,
  getHourBucketStart,
  isStepCounterReset,
} from "./telemetry.helpers";
import { resolveChildTimezone } from "./device-timezone";
import { accumulateStepsToday } from "./steps-today";
import { googleRoadsClient } from "./google-roads.client";
import {
  buildFilteredTrailSegments,
  buildTrailGeometry,
  buildTrailResponseFromCachedSegments,
  cachedSegmentsWithinWindow,
  toCachedSegments,
  type CachedTrailSegment,
} from "./trail-path-builder";
import { evaluateGeofenceForLocation } from "../geofences/geofence-evaluator";
import { childHasCoverage, coveragePredicate, currentCoverageWindow, requireChildCoverage } from "../billing/billing-coverage.service";
import { pushOutboxWorker } from "../push/push-outbox.worker";
import { ACTIVITY_STEP_RATE_THRESHOLD_PER_MINUTE, MAX_ACTIVE_INTERVAL_SECONDS } from "../activity/activity.constants";
import { recordActivityInterval } from "../activity/activity-rollup.service";
import { markHistoryDirty } from "../history/history-materializer";
import { historyWorker } from "../history/history-worker";
import { isOrganizationDeletionPending } from "../account-deletion/account-deletion.service";
import {
  advanceCellLookupAfterSuccess,
  CELL_LOOKUP_LEASE_MS,
  getCellLookupIntervals,
  getInitialCellLookupAt,
  hasUsableNetworkObservation,
  isCellLookupDue,
  shouldLookupEveryCellObservation,
  type CellLookupIntervals,
  type CellLookupMode,
} from "./cell-geolocation";
import { GoogleGeolocationRequestError, locateFromCellTowers } from "./google-geolocation.client";

const DEFAULT_TRAIL_DISTANCE_METERS = 2_000;
const MAX_TRAIL_DISTANCE_METERS = 10_000;
const TRAIL_POINT_FETCH_LIMIT = 500;
const TRAIL_CACHE_REFRESH_MS = 30_000;
const TRAIL_CACHE_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000;
const TRAIL_REFRESH_LEASE_MS = 10_000;
const trailBuildInFlight = new Map<string, Promise<ChildTrailResponseDto>>();
let hasWarnedTrailCacheMissingTable = false;

function isMissingRelationError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const errorCode = "code" in error ? error.code : undefined;
  const cause = "cause" in error ? error.cause : undefined;
  const causeCode = cause && typeof cause === "object" && "code" in cause ? cause.code : undefined;

  return errorCode === "42P01" || causeCode === "42P01";
}

function warnTrailCacheMissingTable(error: unknown) {
  if (hasWarnedTrailCacheMissingTable || !isMissingRelationError(error)) {
    return;
  }

  hasWarnedTrailCacheMissingTable = true;
  console.warn(
    "[trail-cache] child_trail_geometry_cache is unavailable; falling back to uncached trail responses until migrations are applied.",
  );
}

function getTrailBuildKey(childId: string, distanceMeters: number, geometryMode: ChildTrailGeometryRequestMode) {
  return `${childId}:${distanceMeters}:${geometryMode}`;
}

function mapTrailRowsNewestFirst(items: Array<{
  id: string;
  latitude: string;
  longitude: string;
  occurredAt: Date;
  accuracyMeters: string | null;
  stepCounter: number;
}>) {
  return items.map((item) => ({
    accuracyMeters: toNumberOrNull(item.accuracyMeters),
    id: item.id,
    latitude: Number(item.latitude),
    longitude: Number(item.longitude),
    occurredAt: item.occurredAt,
    stepCounter: item.stepCounter,
  }));
}

function appendTailSegments(
  baseSegments: CachedTrailSegment[],
  tailSegments: CachedTrailSegment[],
) {
  if (baseSegments.length === 0) {
    return tailSegments;
  }

  if (tailSegments.length === 0) {
    return baseSegments;
  }

  const nextSegments = baseSegments.map((segment) => ({
    ...segment,
    points: [...segment.points],
  }));
  const firstTailSegment = {
    ...tailSegments[0]!,
    points: [...tailSegments[0]!.points],
  };
  const lastBaseSegment = nextSegments[nextSegments.length - 1]!;
  const lastBasePoint = lastBaseSegment.points[lastBaseSegment.points.length - 1];
  const firstTailPoint = firstTailSegment.points[0];

  if (
    lastBasePoint
    && firstTailPoint
    && lastBasePoint.latitude === firstTailPoint.latitude
    && lastBasePoint.longitude === firstTailPoint.longitude
    && lastBasePoint.occurredAt === firstTailPoint.occurredAt
  ) {
    firstTailSegment.points.shift();
  }

  if (firstTailSegment.points.length >= 2) {
    nextSegments.push(firstTailSegment);
  }

  for (const segment of tailSegments.slice(1)) {
    nextSegments.push({
      ...segment,
      points: [...segment.points],
    });
  }

  return nextSegments;
}

function trimCachedSegmentsBeforeOccurredAt(
  segments: CachedTrailSegment[],
  occurredAt: string,
) {
  const cutoffMs = new Date(occurredAt).getTime();

  if (!Number.isFinite(cutoffMs)) {
    return segments;
  }

  return segments
    .map((segment) => ({
      ...segment,
      points: segment.points.filter((point) => {
        const pointOccurredAtMs = new Date(point.occurredAt).getTime();
        return Number.isFinite(pointOccurredAtMs) && pointOccurredAtMs < cutoffMs;
      }),
    }))
    .filter((segment) => segment.points.length >= 2);
}

function logTrailRoadRefresh(input: {
  childId: string;
  geometrySource: ChildTrailResponseDto["geometrySource"];
  inputPointCount: number;
  mode: "full" | "rolling";
  snappedPointCount: number;
}) {
  if (!env.REALTIME_DEBUG) {
    return;
  }

  console.info("[trail-roads] refreshed", input);
}

async function buildTrailResponseWithSingleFlight(
  childId: string,
  distanceMeters: number,
  geometryMode: ChildTrailGeometryRequestMode,
  build: () => Promise<ChildTrailResponseDto>,
) {
  const key = getTrailBuildKey(childId, distanceMeters, geometryMode);
  const inFlight = trailBuildInFlight.get(key);

  if (inFlight) {
    return inFlight;
  }

  const nextPromise = build().finally(() => {
    trailBuildInFlight.delete(key);
  });
  trailBuildInFlight.set(key, nextPromise);
  return nextPromise;
}

async function cleanupTrailRefreshLease(childId: string) {
  try {
    await db
      .update(childTrailGeometryCache)
      .set({
        refreshLeaseUntil: null,
        updatedAt: new Date(),
      })
      .where(eq(childTrailGeometryCache.childId, childId));
  } catch (error) {
    if (isMissingRelationError(error)) {
      warnTrailCacheMissingTable(error);
      return;
    }

    throw error;
  }
}

async function tryClaimTrailRefreshLease(childId: string) {
  const now = new Date();
  const leaseUntil = new Date(now.getTime() + TRAIL_REFRESH_LEASE_MS);
  try {
    const [row] = await db
      .update(childTrailGeometryCache)
      .set({
        refreshLeaseUntil: leaseUntil,
        updatedAt: now,
      })
      .where(and(
        eq(childTrailGeometryCache.childId, childId),
        or(
          isNull(childTrailGeometryCache.refreshLeaseUntil),
          lt(childTrailGeometryCache.refreshLeaseUntil, now),
        ),
      ))
      .returning({ childId: childTrailGeometryCache.childId });

    return Boolean(row);
  } catch (error) {
    if (isMissingRelationError(error)) {
      warnTrailCacheMissingTable(error);
      return false;
    }

    throw error;
  }
}

async function getTrailCacheRow(childId: string) {
  try {
    const [row] = await db
      .select()
      .from(childTrailGeometryCache)
      .where(eq(childTrailGeometryCache.childId, childId))
      .limit(1);

    return {
      available: true,
      row: row ?? null,
    };
  } catch (error) {
    if (isMissingRelationError(error)) {
      warnTrailCacheMissingTable(error);
      return {
        available: false,
        row: null,
      };
    }

    throw error;
  }
}

async function upsertTrailCache(input: {
  childId: string;
  latestLocationEventId: string | null;
  distanceMeters: number;
  geometrySource: ChildTrailResponseDto["geometrySource"];
  segments: CachedTrailSegment[];
  generatedAt: Date;
  refreshAfter: Date;
  expiresAt: Date;
}) {
  try {
    await db
      .insert(childTrailGeometryCache)
      .values({
        childId: input.childId,
        latestLocationEventId: input.latestLocationEventId,
        distanceMeters: input.distanceMeters,
        geometrySource: input.geometrySource,
        segments: input.segments,
        generatedAt: input.generatedAt,
        refreshAfter: input.refreshAfter,
        expiresAt: input.expiresAt,
        refreshLeaseUntil: null,
        lastError: null,
        updatedAt: input.generatedAt,
      })
      .onConflictDoUpdate({
        target: childTrailGeometryCache.childId,
        set: {
          latestLocationEventId: input.latestLocationEventId,
          distanceMeters: input.distanceMeters,
          geometrySource: input.geometrySource,
          segments: input.segments,
          generatedAt: input.generatedAt,
          refreshAfter: input.refreshAfter,
          expiresAt: input.expiresAt,
          refreshLeaseUntil: null,
          lastError: null,
          updatedAt: input.generatedAt,
        },
      });

    return true;
  } catch (error) {
    if (isMissingRelationError(error)) {
      warnTrailCacheMissingTable(error);
      return false;
    }

    throw error;
  }
}

async function updateTrailCacheError(childId: string, message: string) {
  try {
    await db
      .update(childTrailGeometryCache)
      .set({
        lastError: message,
        refreshLeaseUntil: null,
        updatedAt: new Date(),
      })
      .where(eq(childTrailGeometryCache.childId, childId));
  } catch (error) {
    if (isMissingRelationError(error)) {
      warnTrailCacheMissingTable(error);
      return;
    }

    throw error;
  }
}

async function getOrganizationChildSnapshot(
  organizationId: string,
  childId: string,
) {
  const [row] = await db
    .select({
      child: children,
      snapshot: childStatusSnapshots,
      device: devices,
    })
    .from(children)
    .leftJoin(
      childStatusSnapshots,
      eq(childStatusSnapshots.childId, children.id),
    )
    .leftJoin(
      childDeviceBindings,
      and(
        eq(childDeviceBindings.childId, children.id),
        isNull(childDeviceBindings.unboundAt),
      ),
    )
    .leftJoin(devices, eq(devices.id, childDeviceBindings.deviceId))
    .where(
      and(
        eq(children.organizationId, organizationId),
        eq(children.id, childId),
      ),
    )
    .limit(1);

  if (!row) {
    throw notFound("CHILD_NOT_FOUND", "Child not found.");
  }

  return row;
}

type CellLookupClaim = {
  cellular: LocationTelemetryInput["cellular"];
  wifi: LocationTelemetryInput["wifi"];
  child: typeof children.$inferSelect;
  childId: string;
  deviceId: string;
  generation: number;
  intervals: CellLookupIntervals;
  locationEventId: string;
  lookupMode: CellLookupMode;
  policy: "every_observation" | "scheduled";
  observedAt: Date;
};

async function deferClaimedCellLookup(claim: CellLookupClaim, error: unknown) {
  const retryAt = new Date(claim.observedAt.getTime() + claim.intervals.fastIntervalMs);

  await db
    .update(childStatusSnapshots)
    .set({
      cellLookupLeaseUntil: null,
      nextCellLookupAt: retryAt,
      updatedAt: new Date(),
    })
    .where(and(
      eq(childStatusSnapshots.childId, claim.childId),
      eq(childStatusSnapshots.cellOutageGeneration, claim.generation),
      eq(childStatusSnapshots.lastGpsConnected, false),
    ));

  console.warn("[network-geolocation] lookup failed", {
    childId: claim.childId,
    deviceId: claim.deviceId,
    generation: claim.generation,
    errorName: error instanceof Error ? error.name : "UnknownError",
    providerStatus: error instanceof GoogleGeolocationRequestError ? error.status : null,
    transient: error instanceof GoogleGeolocationRequestError ? error.transient : null,
    policy: claim.policy,
    retryAt: retryAt.toISOString(),
    retryOnNextEligibleUpload: claim.policy === "every_observation",
  });
}

async function promoteCellLocation(
  claim: CellLookupClaim,
  location: Awaited<ReturnType<typeof locateFromCellTowers>>,
) {
  return db.transaction(async (tx) => {
    const [snapshot] = await tx
      .select()
      .from(childStatusSnapshots)
      .where(eq(childStatusSnapshots.childId, claim.childId))
      .limit(1)
      .for("update");

    if (
      !snapshot
      || snapshot.lastGpsConnected !== false
      || snapshot.cellOutageGeneration !== claim.generation
    ) {
      return null;
    }

    const nextLookup = advanceCellLookupAfterSuccess({
      mode: claim.lookupMode,
      previousLatitude: toNumberOrNull(snapshot.lastCellLatitude),
      previousLongitude: toNumberOrNull(snapshot.lastCellLongitude),
      latitude: location.latitude,
      longitude: location.longitude,
      stableSampleCount: snapshot.cellStableSampleCount,
      observedAt: claim.observedAt,
      intervals: claim.intervals,
    });

    const [event] = await tx
      .update(locationEvents)
      .set({
        latitude: location.latitude.toFixed(6),
        longitude: location.longitude.toFixed(6),
        accuracyMeters: location.accuracyMeters.toFixed(2),
        locationSource: "network",
      })
      .where(and(
        eq(locationEvents.id, claim.locationEventId),
        eq(locationEvents.locationSource, "none"),
      ))
      .returning();

    if (!event) {
      return null;
    }

    await tx.insert(cellLocationEstimates).values({
      locationEventId: event.id,
      childId: claim.childId,
      deviceId: claim.deviceId,
      lookupMode: claim.lookupMode,
      towerObservation: { cellular: claim.cellular ?? null, wifi: claim.wifi ?? null },
      latitude: event.latitude,
      longitude: event.longitude,
      accuracyMeters: event.accuracyMeters!,
      distanceFromPreviousMeters: nextLookup.distanceFromPreviousMeters?.toFixed(2) ?? null,
      observedAt: claim.observedAt,
      createdAt: new Date(),
    });

    const childTimezone = resolveChildTimezone({
      latitude: location.latitude,
      longitude: location.longitude,
      storedTimezone: snapshot.deviceTimezone,
    });

    await tx
      .update(childStatusSnapshots)
      .set({
        lastLocationEventId: event.id,
        lastLatitude: event.latitude,
        lastLongitude: event.longitude,
        lastLocationLabel: event.locationLabel,
        lastLocationSource: "network",
        lastLocationAccuracyMeters: event.accuracyMeters,
        lastLocationAt: claim.observedAt,
        lastCellLatitude: event.latitude,
        lastCellLongitude: event.longitude,
        lastCellAccuracyMeters: event.accuracyMeters,
        lastCellEstimateAt: claim.observedAt,
        cellLookupMode: nextLookup.mode,
        nextCellLookupAt: nextLookup.nextLookupAt,
        cellLookupLeaseUntil: null,
        cellStableSampleCount: nextLookup.stableSampleCount,
        deviceTimezone: childTimezone,
        updatedAt: new Date(),
      })
      .where(eq(childStatusSnapshots.childId, claim.childId));

    await tx
      .update(childActivityMinuteBuckets)
      .set({
        representativeLatitude: event.latitude,
        representativeLongitude: event.longitude,
        updatedAt: new Date(),
      })
      .where(eq(childActivityMinuteBuckets.sourceLocationEventId, event.id));

    await markHistoryDirty({
      childId: claim.childId,
      organizationId: claim.child.organizationId,
      deviceId: claim.deviceId,
      locationEventId: event.id,
      occurredAt: claim.observedAt,
    }, tx as never);

    const geofenceResult = await evaluateGeofenceForLocation(tx, {
      child: claim.child,
      event,
    });

    return {
      event,
      geofenceEventId: geofenceResult?.geofenceEvent?.id ?? null,
      geofenceId: geofenceResult?.geofence?.id ?? null,
      geofenceNotificationsCreated: Boolean(geofenceResult?.notificationsCreated),
      nextLookup,
    };
  });
}

export async function ingestLocation(input: LocationTelemetryInput) {
  const hardwareIdentifier = normalizeHardwareIdentifier(
    input.hardwareIdentifier,
  );
  const sampleAt = new Date();
  const hourBucketStart = getHourBucketStart(sampleAt);
  const deviceState = input.deviceState ?? "active";
  const gpsConnected = input.gpsFixValid === undefined
    ? !(input.latitude === 0 && input.longitude === 0)
    : input.gpsFixValid && (input.satelliteCount ?? 0) >= 3;
  const cellLookupIntervals = getCellLookupIntervals(input.simulation, env.NODE_ENV);
  const lookupEveryObservation = shouldLookupEveryCellObservation({
    nodeEnv: env.NODE_ENV,
    simulation: input.simulation,
    gpsConnected,
    enabled: env.CELL_GEOLOCATION_ENABLED,
    cellular: input.cellular,
    wifi: input.wifi,
  });
  const result = await db.transaction(async (tx) => {
    await tx.execute(sql.raw("SET LOCAL statement_timeout = '12s'"));
    await tx.execute(sql.raw("SET LOCAL lock_timeout = '3s'"));
    await tx.execute(sql.raw("SET LOCAL idle_in_transaction_session_timeout = '12s'"));

    const [binding] = await tx
      .select({
        child: children,
        device: devices,
      })
      .from(devices)
      .innerJoin(
        childDeviceBindings,
        and(
          eq(childDeviceBindings.deviceId, devices.id),
          isNull(childDeviceBindings.unboundAt),
        ),
      )
      .innerJoin(children, eq(children.id, childDeviceBindings.childId))
      .where(
        and(
          eq(devices.hardwareIdentifier, hardwareIdentifier),
          eq(devices.status, "active"),
        ),
      )
      .limit(1);

    if (!binding) {
      throw notFound("NOT_FOUND", "No active child-device binding found.");
    }

    if (await isOrganizationDeletionPending(binding.child.organizationId)) {
      throw new AppError(409, "ACCOUNT_DELETION_PENDING", "Tracking is paused while family deletion is pending.");
    }

    const [snapshot] = await tx
      .select()
      .from(childStatusSnapshots)
      .where(eq(childStatusSnapshots.childId, binding.child.id))
      .limit(1)
      .for("update");

    const previousGeneration = snapshot?.cellOutageGeneration ?? 0;
    const isStartingGpsOutage = !gpsConnected
      && snapshot?.lastGpsConnected !== false;
    const outageGeneration = isStartingGpsOutage
      ? previousGeneration + 1
      : previousGeneration;
    let cellLookupMode: CellLookupMode = snapshot?.cellLookupMode ?? "normal";
    let nextCellLookupAt = snapshot?.nextCellLookupAt ?? null;
    let cellLookupLeaseUntil = snapshot?.cellLookupLeaseUntil ?? null;
    let cellStableSampleCount = snapshot?.cellStableSampleCount ?? 0;
    let shouldClaimCellLookup = false;

    if (gpsConnected) {
      cellLookupMode = "normal";
      nextCellLookupAt = null;
      cellLookupLeaseUntil = null;
      cellStableSampleCount = 0;
    } else if (isStartingGpsOutage || !nextCellLookupAt) {
      cellLookupMode = "normal";
      nextCellLookupAt = getInitialCellLookupAt(sampleAt, cellLookupIntervals);
      cellLookupLeaseUntil = null;
      cellStableSampleCount = 0;
    } else {
      if (input.simulation && env.NODE_ENV !== "production") {
        const intervalMs = cellLookupMode === "fast"
          ? cellLookupIntervals.fastIntervalMs
          : cellLookupIntervals.normalIntervalMs;
        const acceleratedLookupAt = new Date(sampleAt.getTime() + intervalMs);

        if (nextCellLookupAt > acceleratedLookupAt) {
          nextCellLookupAt = acceleratedLookupAt;
        }
      }
    }

    if (
      !gpsConnected
      && isCellLookupDue({
        lookupEveryObservation,
        nextLookupAt: nextCellLookupAt,
        leaseUntil: cellLookupLeaseUntil,
        observedAt: sampleAt,
      })
    ) {
      if (env.CELL_GEOLOCATION_ENABLED && hasUsableNetworkObservation(input.cellular, input.wifi)) {
        shouldClaimCellLookup = true;
        cellLookupLeaseUntil = new Date(sampleAt.getTime() + CELL_LOOKUP_LEASE_MS);
      } else if (!lookupEveryObservation) {
        nextCellLookupAt = new Date(sampleAt.getTime() + cellLookupIntervals.fastIntervalMs);
        cellLookupLeaseUntil = null;
      }
    }

    const isCounterReset = isStepCounterReset(
      snapshot?.lastRawStepCounter,
      input.stepCounter,
    );
    const rawStepDelta = deriveStepDelta(
      snapshot?.lastRawStepCounter,
      input.stepCounter,
    );
    const elapsedSeconds = snapshot?.lastSeenAt
      ? Math.floor((sampleAt.getTime() - snapshot.lastSeenAt.getTime()) / 1000)
      : 0;
    // A device reboot rolls its counter back, and the raw derivation credits the
    // whole new counter. Unclamped that books tens of thousands of phantom steps in
    // a single interval, which is now immediately visible in the live daily total.
    const stepDelta = clampStepDelta({
      rawDelta: rawStepDelta,
      elapsedSeconds: snapshot?.lastSeenAt ? elapsedSeconds : null,
      isCounterReset,
    });
    const stepsPerMinute = elapsedSeconds > 0
      ? stepDelta / (elapsedSeconds / 60)
      : 0;
    const isActiveInterval =
      deviceState === "active"
      && stepDelta > 0
      && elapsedSeconds > 0
      && elapsedSeconds <= MAX_ACTIVE_INTERVAL_SECONDS
      && stepsPerMinute >= ACTIVITY_STEP_RATE_THRESHOLD_PER_MINUTE;
    const stepsThisHour =
      snapshot?.currentHourBucketStart?.getTime() === hourBucketStart.getTime()
        ? (snapshot.stepsThisHour ?? 0) + stepDelta
        : stepDelta;
    // The child's day rolls over in the device's timezone, derived from its last
    // known coordinate, so "steps today" matches what the parent sees on screen.
    const childTimezone = resolveChildTimezone({
      latitude: gpsConnected ? input.latitude : null,
      longitude: gpsConnected ? input.longitude : null,
      storedTimezone: snapshot?.deviceTimezone ?? null,
    });
    const stepsTodayState = accumulateStepsToday({
      previous: snapshot
        ? {
          stepsToday: snapshot.stepsToday,
          stepsTodayDate: snapshot.stepsTodayDate,
          stepsTodayTimezone: snapshot.stepsTodayTimezone,
        }
        : null,
      stepDelta,
      sampleAt,
      timezone: childTimezone,
    });

    const [event] = await tx
      .insert(locationEvents)
      .values({
        childId: binding.child.id,
        deviceId: binding.device.id,
        latitude: input.latitude.toFixed(6),
        longitude: input.longitude.toFixed(6),
        gpsConnected,
        locationSource: gpsConnected ? "gps" : "none",
        locationLabel: null,
        accuracyMeters: input.accuracyMeters?.toFixed(2) ?? null,
        batteryPercent: input.batteryPercent ?? null,
        batteryVoltageMv: input.batteryVoltageMv ?? null,
        signalStrength: input.signalStrength ?? null,
        satelliteCount: input.satelliteCount ?? null,
        stepCounter: input.stepCounter,
        deviceState,
        occurredAt: sampleAt,
        ingestedAt: sampleAt,
      })
      .returning();

    if (gpsConnected) {
      await markHistoryDirty({
        childId: binding.child.id,
        organizationId: binding.child.organizationId,
        deviceId: binding.device.id,
        locationEventId: event.id,
        occurredAt: sampleAt,
      }, tx as never);
    }

    if (snapshot?.lastSeenAt && stepDelta > 0 && sampleAt > snapshot.lastSeenAt) {
      await recordActivityInterval({
        childId: binding.child.id,
        deviceId: binding.device.id,
        sourceLocationEventId: event.id,
        startAt: snapshot.lastSeenAt,
        endAt: sampleAt,
        stepDelta,
        isActiveInterval,
        latitude: gpsConnected ? event.latitude : null,
        longitude: gpsConnected ? event.longitude : null,
      }, tx);
    }

    await tx
      .insert(childStatusSnapshots)
      .values({
        childId: binding.child.id,
        lastLocationEventId: gpsConnected ? event.id : (snapshot?.lastLocationEventId ?? null),
        lastLatitude: gpsConnected ? event.latitude : (snapshot?.lastLatitude ?? null),
        lastLongitude: gpsConnected ? event.longitude : (snapshot?.lastLongitude ?? null),
        lastLocationLabel: gpsConnected ? event.locationLabel : (snapshot?.lastLocationLabel ?? null),
        lastLocationSource: gpsConnected ? "gps" : (snapshot?.lastLocationSource ?? null),
        lastLocationAccuracyMeters: gpsConnected ? event.accuracyMeters : (snapshot?.lastLocationAccuracyMeters ?? null),
        lastLocationAt: gpsConnected ? sampleAt : (snapshot?.lastLocationAt ?? null),
        lastGpsConnected: gpsConnected,
        lastGpsFixAt: gpsConnected ? sampleAt : (snapshot?.lastGpsFixAt ?? null),
        gpsOutageStartedAt: gpsConnected
          ? null
          : isStartingGpsOutage
            ? sampleAt
            : (snapshot?.gpsOutageStartedAt ?? sampleAt),
        cellLookupMode,
        nextCellLookupAt,
        cellLookupLeaseUntil,
        cellOutageGeneration: outageGeneration,
        cellStableSampleCount,
        lastCellLatitude: gpsConnected ? null : (snapshot?.lastCellLatitude ?? null),
        lastCellLongitude: gpsConnected ? null : (snapshot?.lastCellLongitude ?? null),
        lastCellAccuracyMeters: gpsConnected ? null : (snapshot?.lastCellAccuracyMeters ?? null),
        lastCellEstimateAt: gpsConnected ? null : (snapshot?.lastCellEstimateAt ?? null),
        lastBatteryPercent: event.batteryPercent,
        lastBatteryVoltageMv: event.batteryVoltageMv,
        lastSignalStrength: event.signalStrength,
        lastSatelliteCount: event.satelliteCount,
        lastRawStepCounter: event.stepCounter,
        lastStepDelta: stepDelta,
        stepsThisHour,
        currentHourBucketStart: hourBucketStart,
        stepsToday: stepsTodayState.stepsToday,
        stepsTodayDate: stepsTodayState.stepsTodayDate,
        stepsTodayTimezone: stepsTodayState.stepsTodayTimezone,
        deviceTimezone: childTimezone,
        lastDeviceState: event.deviceState,
        status: event.deviceState === "offline" ? "offline" : "safe",
        statusLabel:
          event.deviceState === "sleep"
            ? "Sleeping"
            : event.deviceState === "offline"
              ? "Offline"
              : "Live",
        lastSeenAt: sampleAt,
        updatedAt: sampleAt,
      })
      .onConflictDoUpdate({
        target: childStatusSnapshots.childId,
        set: {
          lastLocationEventId: gpsConnected ? event.id : (snapshot?.lastLocationEventId ?? null),
          lastLatitude: gpsConnected ? event.latitude : (snapshot?.lastLatitude ?? null),
          lastLongitude: gpsConnected ? event.longitude : (snapshot?.lastLongitude ?? null),
          lastLocationLabel: gpsConnected ? event.locationLabel : (snapshot?.lastLocationLabel ?? null),
          lastLocationSource: gpsConnected ? "gps" : (snapshot?.lastLocationSource ?? null),
          lastLocationAccuracyMeters: gpsConnected ? event.accuracyMeters : (snapshot?.lastLocationAccuracyMeters ?? null),
          lastLocationAt: gpsConnected ? sampleAt : (snapshot?.lastLocationAt ?? null),
          lastGpsConnected: gpsConnected,
          lastGpsFixAt: gpsConnected ? sampleAt : (snapshot?.lastGpsFixAt ?? null),
          gpsOutageStartedAt: gpsConnected
            ? null
            : isStartingGpsOutage
              ? sampleAt
              : (snapshot?.gpsOutageStartedAt ?? sampleAt),
          cellLookupMode,
          nextCellLookupAt,
          cellLookupLeaseUntil,
          cellOutageGeneration: outageGeneration,
          cellStableSampleCount,
          lastCellLatitude: gpsConnected ? null : (snapshot?.lastCellLatitude ?? null),
          lastCellLongitude: gpsConnected ? null : (snapshot?.lastCellLongitude ?? null),
          lastCellAccuracyMeters: gpsConnected ? null : (snapshot?.lastCellAccuracyMeters ?? null),
          lastCellEstimateAt: gpsConnected ? null : (snapshot?.lastCellEstimateAt ?? null),
          lastBatteryPercent: event.batteryPercent,
          lastBatteryVoltageMv: event.batteryVoltageMv,
          lastSignalStrength: event.signalStrength,
          lastSatelliteCount: event.satelliteCount,
          lastRawStepCounter: event.stepCounter,
          lastStepDelta: stepDelta,
          stepsThisHour,
          currentHourBucketStart: hourBucketStart,
          stepsToday: stepsTodayState.stepsToday,
          stepsTodayDate: stepsTodayState.stepsTodayDate,
          stepsTodayTimezone: stepsTodayState.stepsTodayTimezone,
          deviceTimezone: childTimezone,
          lastDeviceState: event.deviceState,
          status: event.deviceState === "offline" ? "offline" : "safe",
          statusLabel:
            event.deviceState === "sleep"
              ? "Sleeping"
              : event.deviceState === "offline"
                ? "Offline"
                : "Live",
          lastSeenAt: sampleAt,
          updatedAt: sampleAt,
        },
      });

    await tx
      .insert(childStepCountsHourly)
      .values({
        childId: binding.child.id,
        deviceId: binding.device.id,
        bucketStart: hourBucketStart,
        stepCount: stepDelta,
        createdAt: sampleAt,
        updatedAt: sampleAt,
      })
      .onConflictDoUpdate({
        target: [
          childStepCountsHourly.childId,
          childStepCountsHourly.deviceId,
          childStepCountsHourly.bucketStart,
        ],
        set: {
          stepCount: sql`${childStepCountsHourly.stepCount} + ${stepDelta}`,
          updatedAt: sampleAt,
        },
      });

    await tx
      .update(devices)
      .set({
        lastSeenAt: sampleAt,
        updatedAt: sampleAt,
      })
      .where(eq(devices.id, binding.device.id));

    const geofenceResult = gpsConnected
      ? await evaluateGeofenceForLocation(tx, {
        child: binding.child,
        event,
      })
      : null;

    return {
      childId: binding.child.id,
      deviceId: binding.device.id,
      locationEventId: event.id,
      occurredAt: sampleAt.toISOString(),
      geofenceEventId: geofenceResult?.geofenceEvent?.id ?? null,
      geofenceId: geofenceResult?.geofence?.id ?? null,
      geofenceNotificationsCreated: Boolean(geofenceResult?.notificationsCreated),
      gpsConnected,
      organizationId: binding.child.organizationId,
      cellLookupClaim: shouldClaimCellLookup && hasUsableNetworkObservation(input.cellular, input.wifi)
        ? {
          cellular: input.cellular,
          wifi: input.wifi,
          child: binding.child,
          childId: binding.child.id,
          deviceId: binding.device.id,
          generation: outageGeneration,
          intervals: cellLookupIntervals,
          locationEventId: event.id,
          lookupMode: cellLookupMode,
          policy: lookupEveryObservation ? "every_observation" : "scheduled",
          observedAt: sampleAt,
        } satisfies CellLookupClaim
        : null,
      activityStepped: {
        childId: binding.child.id,
        stepDelta,
        stepsToday: stepsTodayState.stepsToday,
        localDate: stepsTodayState.stepsTodayDate,
        timezone: stepsTodayState.stepsTodayTimezone,
        localHour: Number(formatInTimeZone(sampleAt, childTimezone, "H")),
        isActiveInterval,
        activeSeconds: isActiveInterval
          ? Math.min(elapsedSeconds, MAX_ACTIVE_INTERVAL_SECONDS)
          : 0,
        occurredAt: sampleAt.toISOString(),
      } satisfies ActivitySteppedEventDto,
    };
  });

  let cellPromotion: Awaited<ReturnType<typeof promoteCellLocation>> = null;

  if (result.cellLookupClaim) {
    const servingTower = result.cellLookupClaim.cellular?.towers.find((tower) => tower.role === "serving");
    console.info("[network-geolocation] lookup started", {
      childId: result.childId,
      deviceId: result.deviceId,
      locationEventId: result.locationEventId,
      policy: result.cellLookupClaim.policy,
      cellId: servingTower?.cellId,
      towerCount: result.cellLookupClaim.cellular?.towers.length ?? 0,
      wifiCount: result.cellLookupClaim.wifi?.accessPoints.length ?? 0,
    });
    try {
      const location = await locateFromCellTowers(result.cellLookupClaim.cellular, result.cellLookupClaim.wifi);
      cellPromotion = await promoteCellLocation(result.cellLookupClaim, location);

      if (cellPromotion) {
        console.info("[network-geolocation] lookup succeeded", {
          childId: result.childId,
          deviceId: result.deviceId,
          accuracyMeters: Number(cellPromotion.event.accuracyMeters),
          distanceFromPreviousMeters: cellPromotion.nextLookup.distanceFromPreviousMeters,
          mode: cellPromotion.nextLookup.mode,
          nextLookupAt: cellPromotion.nextLookup.nextLookupAt.toISOString(),
          policy: result.cellLookupClaim.policy,
        });
      }
    } catch (error) {
      await deferClaimedCellLookup(result.cellLookupClaim, error);
    }
  }

  const geofenceEventId = cellPromotion?.geofenceEventId ?? result.geofenceEventId;
  const geofenceId = cellPromotion?.geofenceId ?? result.geofenceId;
  const geofenceNotificationsCreated = cellPromotion?.geofenceNotificationsCreated
    || result.geofenceNotificationsCreated;

  const child = await getLiveChildForOrganization(
    result.organizationId,
    result.childId,
  );
  const childUpdateStats = realtimeRegistry.broadcast(result.organizationId, {
    type: "child.updated",
    data: child,
  });
  // Always true with enforcement off; one lookup serves both realtime gates.
  const childCovered = await childHasCoverage(result.organizationId, result.childId);
  // Lets the Activity screen advance today's totals between fetches. Only emitted
  // when steps actually moved, so an idle device does not wake subscribers.
  if (result.activityStepped.stepDelta > 0 && childCovered) {
    realtimeRegistry.broadcast(result.organizationId, {
      type: "activity.stepped",
      data: result.activityStepped,
    });
  }
  let notificationsChangedSent = 0;

  if (geofenceNotificationsCreated) {
    const stats = realtimeRegistry.broadcast(result.organizationId, {
      type: "notifications.changed",
      data: {
        reason: "created",
      },
    });
    notificationsChangedSent = stats.sent;
    pushOutboxWorker.kick();
  }
  if (result.gpsConnected || cellPromotion) {
    historyWorker.kick();
  }
  const publicShareStats = childCovered ? await publicShareRealtimeRegistry.broadcastChildUpdate(
    result.childId,
    toPublicShareChildDto(child.child),
  ) : { sent: 0 };

  adminRealtimeRegistry.broadcast({
    type: "admin:device.telemetry.changed",
    data: {
      deviceId: result.deviceId,
      childId: result.childId,
      locationEventId: result.locationEventId,
      occurredAt: result.occurredAt,
      reason: "telemetry_ingested",
    },
  });

  if (geofenceId) {
    adminRealtimeRegistry.broadcast({
      type: "admin:geofence.changed",
      data: {
        geofenceId,
        childId: result.childId,
        deviceId: result.deviceId,
        reason: "telemetry_ingested",
      },
    });
  }

  if (geofenceNotificationsCreated) {
    adminRealtimeRegistry.broadcast({
      type: "admin:geofence.breach.created",
      data: {
        geofenceId: geofenceId ?? undefined,
        geofenceEventId: geofenceEventId ?? undefined,
        childId: result.childId,
        deviceId: result.deviceId,
        reason: "breach_created",
      },
    });
  }

  logRealtimeDebug("telemetry_ingested", {
    hardwareIdentifier,
    childId: result.childId,
    organizationId: result.organizationId,
    deviceState,
    gpsConnected,
    stepCounter: input.stepCounter,
    childUpdateSent: childUpdateStats.sent,
    notificationsChangedSent,
    publicShareSent: publicShareStats.sent,
  });

  return child;
}

export async function ingestSteps(deviceId: string, input: StepTelemetryInput) {
  const [binding] = await db
    .select()
    .from(childDeviceBindings)
    .where(
      and(
        eq(childDeviceBindings.deviceId, deviceId),
        isNull(childDeviceBindings.unboundAt),
      ),
    )
    .limit(1);

  if (!binding) {
    throw notFound("NOT_FOUND", "No active child-device binding found.");
  }

  const [step] = await db
    .insert(stepCountsDaily)
    .values({
      childId: binding.childId,
      deviceId,
      eventDate: input.eventDate,
      stepCount: input.stepCount,
    })
    .onConflictDoUpdate({
      target: [
        stepCountsDaily.childId,
        stepCountsDaily.deviceId,
        stepCountsDaily.eventDate,
      ],
      set: {
        stepCount: input.stepCount,
        updatedAt: new Date(),
      },
    })
    .returning();

  return {
    id: step.id,
    childId: step.childId,
    eventDate: step.eventDate,
    stepCount: step.stepCount,
  };
}

export async function getLiveChildForOrganization(
  organizationId: string,
  childId: string,
): Promise<ChildLiveResponseDto> {
  const row = await getOrganizationChildSnapshot(organizationId, childId);
  const activePlan = await getActiveSubscriptionForChild(childId);

  return {
    child: await toChildSummaryDto({
      child: row.child,
      snapshot: row.snapshot,
      device: row.device,
      activePlan,
    }),
  };
}

export async function getLocationHistoryForOrganization(
  organizationId: string,
  childId: string,
  page = 1,
  pageSize = 20,
): Promise<LocationHistoryResponseDto> {
  await getOrganizationChildSnapshot(organizationId, childId);
  // Firmware counters are hidden only for a child that is not covered now.
  const showStepCounter = await childHasCoverage(organizationId, childId);

  const offset = (page - 1) * pageSize;
  const items = await db
    .select()
    .from(locationEvents)
    .where(and(eq(locationEvents.childId, childId), ne(locationEvents.locationSource, "none"), coveragePredicate(organizationId, locationEvents.deviceId, locationEvents.occurredAt)))
    .orderBy(desc(locationEvents.occurredAt))
    .limit(pageSize)
    .offset(offset);

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)` })
    .from(locationEvents)
    .where(and(eq(locationEvents.childId, childId), ne(locationEvents.locationSource, "none"), coveragePredicate(organizationId, locationEvents.deviceId, locationEvents.occurredAt)));

  return {
    items: items.map((item) => ({
      id: item.id,
      childId: item.childId,
      latitude: Number(item.latitude),
      longitude: Number(item.longitude),
      source: item.locationSource as "gps" | "cell" | "network",
      locationLabel: item.locationLabel,
      accuracyMeters: toNumberOrNull(item.accuracyMeters),
      batteryPercent: item.batteryPercent,
      batteryVoltageMv: item.batteryVoltageMv,
      signalStrength: item.signalStrength,
      satelliteCount: item.satelliteCount,
      stepCounter: showStepCounter ? item.stepCounter : 0,
      deviceState: item.deviceState,
      occurredAt: item.occurredAt.toISOString(),
      ingestedAt: item.ingestedAt.toISOString(),
    })),
    page,
    pageSize,
    total: Number(total),
    hasMore: offset + items.length < Number(total),
  };
}

export async function getChildTrailForOrganization(
  organizationId: string,
  childId: string,
  distanceMeters = DEFAULT_TRAIL_DISTANCE_METERS,
  geometryMode: ChildTrailGeometryRequestMode = "roads",
): Promise<ChildTrailResponseDto> {
  const childRow = await getOrganizationChildSnapshot(organizationId, childId);
  await requireChildCoverage(organizationId, childId);
  const window = childRow.device ? await currentCoverageWindow(organizationId, childRow.device.id) : null;

  const clampedDistanceMeters = Math.min(Math.max(Math.round(distanceMeters), 1), MAX_TRAIL_DISTANCE_METERS);
  return buildTrailResponseWithSingleFlight(childId, clampedDistanceMeters, geometryMode, async () => {
    const [items, geofenceRow, cacheResult] = await Promise.all([
      db
        .select({
          id: locationEvents.id,
          latitude: locationEvents.latitude,
          longitude: locationEvents.longitude,
          occurredAt: locationEvents.occurredAt,
          accuracyMeters: locationEvents.accuracyMeters,
          stepCounter: locationEvents.stepCounter,
        })
        .from(locationEvents)
        .where(and(eq(locationEvents.childId, childId), ne(locationEvents.locationSource, "none"), coveragePredicate(organizationId, locationEvents.deviceId, locationEvents.occurredAt), window ? sql`${locationEvents.occurredAt} >= ${window.startsAt.toISOString()}::timestamptz` : undefined))
        .orderBy(desc(locationEvents.occurredAt))
        .limit(TRAIL_POINT_FETCH_LIMIT),
      db
        .select({
          centerLatitude: childGeofences.centerLatitude,
          centerLongitude: childGeofences.centerLongitude,
          radiusMeters: childGeofences.radiusMeters,
          status: childGeofences.status,
        })
        .from(childGeofences)
        .where(eq(childGeofences.childId, childId))
        .limit(1)
        .then((rows) => rows[0] ?? null),
      getTrailCacheRow(childId),
    ]);
    // The child is covered (requireChildCoverage above). Under enforcement the
    // trail is limited to the current coverage window, so a cache row holding
    // any point from before that window (e.g. built while enforcement was off
    // or during an earlier paid period) is ignored and rebuilt.
    const cachedRow = cacheResult.row && window && !cachedSegmentsWithinWindow(cacheResult.row.segments, window.startsAt)
      ? null
      : cacheResult.row;
    const trailCacheAvailable = cacheResult.available;

    const rowsNewestFirst = mapTrailRowsNewestFirst(items);
    const rowsOldestFirst = [...rowsNewestFirst].reverse();
    const latestLocationEventId = items[0]?.id ?? null;

    if (rowsOldestFirst.length < 2) {
      return {
        childId,
        distanceMeters: clampedDistanceMeters,
        generatedAt: new Date().toISOString(),
        geometrySource: "filtered",
        segments: [],
        points: [],
      };
    }

    const shouldUseRoads = geometryMode === "roads" && env.TRAIL_ROAD_SNAPPING_ENABLED && Boolean(env.GOOGLE_ROADS_API_KEY);
    const now = new Date();
    const cacheIsUsable = Boolean(
      trailCacheAvailable
      && cachedRow
      && cachedRow.distanceMeters === clampedDistanceMeters
      && cachedRow.expiresAt > now
      && Array.isArray(cachedRow.segments),
    );

    if (cacheIsUsable && geometryMode === "roads") {
      const baseSegments = cachedRow!.segments as CachedTrailSegment[];
      const latestChanged = latestLocationEventId && cachedRow!.latestLocationEventId && latestLocationEventId !== cachedRow!.latestLocationEventId;

      if (!latestChanged && cachedRow!.refreshAfter > now) {
        return buildTrailResponseFromCachedSegments({
          childId,
          distanceMeters: clampedDistanceMeters,
          generatedAt: cachedRow!.generatedAt.toISOString(),
          geometrySource: cachedRow!.geometrySource as ChildTrailResponseDto["geometrySource"],
          segments: baseSegments,
        });
      }

      if (latestChanged && cachedRow!.refreshAfter > now) {
        const cachedLatestIndex = items.findIndex((item) => item.id === cachedRow!.latestLocationEventId);

        if (cachedLatestIndex >= 0) {
          const tailRowsOldestFirst = mapTrailRowsNewestFirst(items.slice(0, cachedLatestIndex + 1)).reverse();
          const tailSegments = toCachedSegments(buildFilteredTrailSegments(tailRowsOldestFirst));

          return buildTrailResponseFromCachedSegments({
            childId,
            distanceMeters: clampedDistanceMeters,
            generatedAt: cachedRow!.generatedAt.toISOString(),
            geometrySource: latestChanged ? "hybrid" : cachedRow!.geometrySource as ChildTrailResponseDto["geometrySource"],
            segments: appendTailSegments(baseSegments, tailSegments),
          });
        }
      }
    }

    if (!shouldUseRoads) {
      const filteredSegments = toCachedSegments(buildFilteredTrailSegments(rowsOldestFirst));
      return buildTrailResponseFromCachedSegments({
        childId,
        distanceMeters: clampedDistanceMeters,
        generatedAt: new Date().toISOString(),
        geometrySource: "filtered",
        segments: filteredSegments,
      });
    }

    if (!trailCacheAvailable) {
      const builtGeometry = await buildTrailGeometry(rowsOldestFirst, {
        geofence: geofenceRow
          ? {
              centerLatitude: toNumberOrNull(geofenceRow.centerLatitude),
              centerLongitude: toNumberOrNull(geofenceRow.centerLongitude),
              radiusMeters: geofenceRow.radiusMeters,
              status: geofenceRow.status,
            }
          : null,
        geometryMode,
        roadsEnabled: shouldUseRoads,
        roadSnapper: (points) => googleRoadsClient.snapToRoads(points),
      });

      return buildTrailResponseFromCachedSegments({
        childId,
        distanceMeters: clampedDistanceMeters,
        generatedAt: new Date().toISOString(),
        geometrySource: builtGeometry.geometrySource,
        segments: builtGeometry.segments,
      });
    }

    const claimedLease = cachedRow ? await tryClaimTrailRefreshLease(childId) : true;

    if (!claimedLease && cacheIsUsable && cachedRow) {
      return buildTrailResponseFromCachedSegments({
        childId,
        distanceMeters: clampedDistanceMeters,
        generatedAt: cachedRow.generatedAt.toISOString(),
        geometrySource: cachedRow.geometrySource as ChildTrailResponseDto["geometrySource"],
        segments: cachedRow.segments as CachedTrailSegment[],
      });
    }

    try {
      if (cacheIsUsable && cachedRow && geometryMode === "roads" && latestLocationEventId !== cachedRow.latestLocationEventId) {
        const cachedLatestIndex = items.findIndex((item) => item.id === cachedRow.latestLocationEventId);

        if (cachedLatestIndex >= 0) {
          const recentRowsOldestFirst = mapTrailRowsNewestFirst(
            items.slice(0, Math.min(items.length, cachedLatestIndex + 4, 100)),
          ).reverse();
          const overlapOccurredAt = recentRowsOldestFirst[0]?.occurredAt.toISOString();

          if (overlapOccurredAt) {
            const rollingGeometry = await buildTrailGeometry(recentRowsOldestFirst, {
              geofence: geofenceRow
                ? {
                    centerLatitude: toNumberOrNull(geofenceRow.centerLatitude),
                    centerLongitude: toNumberOrNull(geofenceRow.centerLongitude),
                    radiusMeters: geofenceRow.radiusMeters,
                    status: geofenceRow.status,
                  }
                : null,
              geometryMode,
              roadsEnabled: shouldUseRoads,
              roadSnapper: (points) => googleRoadsClient.snapToRoads(points),
            });
            const baseSegments = trimCachedSegmentsBeforeOccurredAt(
              cachedRow.segments as CachedTrailSegment[],
              overlapOccurredAt,
            );
            const mergedSegments = appendTailSegments(baseSegments, rollingGeometry.segments);
            const generatedAt = new Date();
            const refreshAfter = new Date(generatedAt.getTime() + TRAIL_CACHE_REFRESH_MS);
            const expiresAt = new Date(generatedAt.getTime() + TRAIL_CACHE_EXPIRY_MS);

            await upsertTrailCache({
              childId,
              latestLocationEventId,
              distanceMeters: clampedDistanceMeters,
              geometrySource: rollingGeometry.geometrySource,
              segments: mergedSegments,
              generatedAt,
              refreshAfter,
              expiresAt,
            });
            logTrailRoadRefresh({
              childId,
              geometrySource: rollingGeometry.geometrySource,
              inputPointCount: recentRowsOldestFirst.length,
              mode: "rolling",
              snappedPointCount: rollingGeometry.segments.reduce(
                (total, segment) => total + (segment.source === "roads" ? segment.points.length : 0),
                0,
              ),
            });

            return buildTrailResponseFromCachedSegments({
              childId,
              distanceMeters: clampedDistanceMeters,
              generatedAt: generatedAt.toISOString(),
              geometrySource: rollingGeometry.geometrySource,
              segments: mergedSegments,
            });
          }
        }
      }

      const builtGeometry = await buildTrailGeometry(rowsOldestFirst, {
        geofence: geofenceRow
          ? {
              centerLatitude: toNumberOrNull(geofenceRow.centerLatitude),
              centerLongitude: toNumberOrNull(geofenceRow.centerLongitude),
              radiusMeters: geofenceRow.radiusMeters,
              status: geofenceRow.status,
            }
          : null,
        geometryMode,
        roadsEnabled: shouldUseRoads,
        roadSnapper: (points) => googleRoadsClient.snapToRoads(points),
      });
      const generatedAt = new Date();
      const refreshAfter = new Date(generatedAt.getTime() + TRAIL_CACHE_REFRESH_MS);
      const expiresAt = new Date(generatedAt.getTime() + TRAIL_CACHE_EXPIRY_MS);

      await upsertTrailCache({
        childId,
        latestLocationEventId,
        distanceMeters: clampedDistanceMeters,
        geometrySource: builtGeometry.geometrySource,
        segments: builtGeometry.segments,
        generatedAt,
        refreshAfter,
        expiresAt,
      });
      logTrailRoadRefresh({
        childId,
        geometrySource: builtGeometry.geometrySource,
        inputPointCount: rowsOldestFirst.length,
        mode: "full",
        snappedPointCount: builtGeometry.segments.reduce(
          (total, segment) => total + (segment.source === "roads" ? segment.points.length : 0),
          0,
        ),
      });

      return buildTrailResponseFromCachedSegments({
        childId,
        distanceMeters: clampedDistanceMeters,
        generatedAt: generatedAt.toISOString(),
        geometrySource: builtGeometry.geometrySource,
        segments: builtGeometry.segments,
      });
    } catch (error) {
      if (cachedRow) {
        await updateTrailCacheError(
          childId,
          error instanceof Error ? error.message : "Trail build failed.",
        );

        return buildTrailResponseFromCachedSegments({
          childId,
          distanceMeters: clampedDistanceMeters,
          generatedAt: cachedRow.generatedAt.toISOString(),
          geometrySource: cachedRow.geometrySource as ChildTrailResponseDto["geometrySource"],
          segments: cachedRow.segments as CachedTrailSegment[],
        });
      }

      throw error;
    } finally {
      if (cachedRow) {
        await cleanupTrailRefreshLease(childId);
      }
    }
  });
}

export async function cleanupExpiredTrailGeometryCache(limit = 500) {
  try {
    const now = new Date();
    await db.execute(sql`
      with expired as (
        select ${childTrailGeometryCache.childId}
        from ${childTrailGeometryCache}
        where ${childTrailGeometryCache.expiresAt} < ${now.toISOString()}::timestamptz
        order by ${childTrailGeometryCache.expiresAt}, ${childTrailGeometryCache.childId}
        limit ${limit}
        for update skip locked
      )
      delete from ${childTrailGeometryCache}
      using expired
      where ${childTrailGeometryCache.childId} = expired.child_id
    `);
  } catch (error) {
    if (isMissingRelationError(error)) {
      warnTrailCacheMissingTable(error);
      return;
    }

    throw error;
  }
}
