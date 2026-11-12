import { and, eq } from "drizzle-orm";
import { type NotificationType } from "@stepwhere/types";

import { childGeofences, type children } from "../../db/schema";
import { createGeofenceEvent, type LocationEventRow } from "./geofence-events.service";
import { haversineDistanceMeters } from "./geofence-distance";
import { createGeofenceNotifications } from "./geofence-notifications.service";
import { deviceHasCoverage } from "../billing/billing-coverage.service";

const OUTSIDE_BUFFER_METERS = 20;
export const REQUIRED_OUTSIDE_CONFIRMATION_SAMPLES = 4;
export const REQUIRED_INSIDE_CONFIRMATION_SAMPLES = 2;

type ChildRow = typeof children.$inferSelect;

export type GeofenceSampleState = "deadband" | "inside" | "outside";
type GeofenceContainmentState = "unknown" | "inside" | "outside";

function classifySample(distanceMeters: number, radiusMeters: number): GeofenceSampleState {
  if (distanceMeters <= radiusMeters) {
    return "inside";
  }

  if (distanceMeters > radiusMeters + OUTSIDE_BUFFER_METERS) {
    return "outside";
  }

  return "deadband";
}

export function advanceGeofenceCandidate(input: {
  candidateSampleCount: number;
  candidateState: GeofenceContainmentState;
  containmentState: GeofenceContainmentState;
  sampleState: GeofenceSampleState;
}) {
  if (
    input.sampleState === "deadband"
    || input.sampleState === input.containmentState
  ) {
    return {
      candidateSampleCount: 0,
      candidateState: "unknown" as const,
      confirmedState: null,
    };
  }

  const candidateSampleCount = input.candidateState === input.sampleState
    ? input.candidateSampleCount + 1
    : 1;
  const requiredSampleCount = input.sampleState === "outside"
    ? REQUIRED_OUTSIDE_CONFIRMATION_SAMPLES
    : REQUIRED_INSIDE_CONFIRMATION_SAMPLES;

  if (candidateSampleCount >= requiredSampleCount) {
    return {
      candidateSampleCount: 0,
      candidateState: "unknown" as const,
      confirmedState: input.sampleState,
    };
  }

  return {
    candidateSampleCount,
    candidateState: input.sampleState,
    confirmedState: null,
  };
}

export async function evaluateGeofenceForLocation(
  tx: Parameters<Parameters<typeof import("../../db/client").db.transaction>[0]>[0],
  input: {
    child: ChildRow;
    event: LocationEventRow;
  },
) {
  if (!await deviceHasCoverage(input.child.organizationId, input.event.deviceId, new Date(), tx)
    || !await deviceHasCoverage(input.child.organizationId, input.event.deviceId, input.event.occurredAt, tx)) return null;
  const [geofence] = await tx
    .select()
    .from(childGeofences)
    .where(and(
      eq(childGeofences.childId, input.child.id),
      eq(childGeofences.organizationId, input.child.organizationId),
    ))
    .limit(1)
    .for("update");

  if (
    !geofence
    || geofence.status !== "enabled"
    || geofence.centerLatitude == null
    || geofence.centerLongitude == null
    || geofence.radiusMeters == null
  ) {
    return null;
  }

  const distanceMeters = haversineDistanceMeters({
    fromLatitude: Number(geofence.centerLatitude),
    fromLongitude: Number(geofence.centerLongitude),
    toLatitude: Number(input.event.latitude),
    toLongitude: Number(input.event.longitude),
  });

  const sampleState = classifySample(distanceMeters, geofence.radiusMeters);
  const nextUpdate: Partial<typeof childGeofences.$inferInsert> = {
    lastDistanceMeters: distanceMeters.toFixed(2),
    lastEvaluatedAt: input.event.occurredAt,
    updatedAt: input.event.occurredAt,
  };

  let nextContainmentState = geofence.containmentState;
  let notificationType: NotificationType | null = null;

  const candidateAdvance = advanceGeofenceCandidate({
    candidateSampleCount: geofence.candidateSampleCount,
    candidateState: geofence.candidateState,
    containmentState: geofence.containmentState,
    sampleState,
  });

  nextUpdate.candidateState = candidateAdvance.candidateState;
  nextUpdate.candidateSampleCount = candidateAdvance.candidateSampleCount;

  if (candidateAdvance.confirmedState) {
    nextContainmentState = candidateAdvance.confirmedState;
    nextUpdate.containmentState = candidateAdvance.confirmedState;
    nextUpdate.candidateState = "unknown";
    nextUpdate.candidateSampleCount = 0;

    if (candidateAdvance.confirmedState === "outside") {
      nextUpdate.breachedAt = input.event.occurredAt;
      notificationType = "geofence_breached";
    } else {
      nextUpdate.breachedAt = null;
      nextUpdate.lastReenteredAt = input.event.occurredAt;
      notificationType = geofence.containmentState === "outside"
        ? "geofence_reentered"
        : null;
    }
  }

  const [saved] = await tx
    .update(childGeofences)
    .set(nextUpdate)
    .where(eq(childGeofences.id, geofence.id))
    .returning();

  if (!saved) {
    return null;
  }

  if (!notificationType) {
    return { geofence: saved, notificationsCreated: false };
  }

  const geofenceEvent = await createGeofenceEvent(tx, {
    dedupKey: `${saved.id}:${saved.generation}:${notificationType}:${input.event.id}`,
    distanceMeters,
    eventType: notificationType === "geofence_breached" ? "breached" : "reentered",
    geofence: saved,
    latitude: Number(input.event.latitude),
    locationEventId: input.event.id,
    longitude: Number(input.event.longitude),
    occurredAt: input.event.occurredAt,
    radiusMeters: saved.radiusMeters,
  });

  if (!geofenceEvent) {
    return { geofence: saved, notificationsCreated: false };
  }

  await createGeofenceNotifications(tx, {
    child: input.child,
    event: geofenceEvent,
    type: notificationType,
  });

  return {
    geofence: saved,
    geofenceEvent,
    notificationsCreated: true,
    nextContainmentState,
    notificationType,
  };
}
