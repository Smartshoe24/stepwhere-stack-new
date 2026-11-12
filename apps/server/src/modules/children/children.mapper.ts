import type {
  ChildDetailDto,
  ChildGeofenceDto,
  ChildSummaryDto,
  DeviceSummaryDto,
  OverviewChildDto,
  PlaceDto,
} from "@stepwhere/types";

import type { childGeofences, children, childStatusSnapshots, devices, places } from "../../db/schema";
import type { ActiveSubscriptionDto } from "@stepwhere/types";
import { toInitials, toIsoString, toNumberOrNull } from "../../shared/mappers";
import { resolveAvatarUrl } from "../uploads/uploads.service";
import { deriveConnectivityState, deriveTelemetryState } from "../telemetry/telemetry.helpers";
import { billingEnforced, deviceHasCoverage, snapshotLocationHasCoverage } from "../billing/billing-coverage.service";

type ChildRecord = typeof children.$inferSelect;
type SnapshotRecord = typeof childStatusSnapshots.$inferSelect | null;
type DeviceRecord = typeof devices.$inferSelect | null;
type GeofenceRecord = typeof childGeofences.$inferSelect | null;
type PlaceRecord = typeof places.$inferSelect | null;

export function toPlaceDto(place: PlaceRecord): PlaceDto | null {
  if (!place) {
    return null;
  }

  return {
    id: place.id,
    kind: place.kind,
    provider: place.provider as "google",
    providerPlaceId: place.providerPlaceId,
    label: place.label,
    formattedAddress: place.formattedAddress,
    latitude: Number(place.latitude),
    longitude: Number(place.longitude),
  };
}

export function toDeviceSummary(device: DeviceRecord): DeviceSummaryDto | null {
  if (!device) {
    return null;
  }

  return {
    id: device.id,
    hardwareIdentifier: device.hardwareIdentifier,
    displayName: device.displayName,
    platform: device.platform,
    status: device.status,
    lastSeenAt: toIsoString(device.lastSeenAt),
  };
}

export async function toChildSummaryDto(input: {
  child: ChildRecord;
  snapshot: SnapshotRecord;
  device: DeviceRecord;
  activePlan: ActiveSubscriptionDto | null;
}): Promise<ChildSummaryDto> {
  const { child, device, activePlan } = input;
  const allowed = await deviceHasCoverage(child.organizationId, device?.id ?? null);
  const snapshotCovered = !input.snapshot?.lastSeenAt || await deviceHasCoverage(child.organizationId, device?.id ?? null, input.snapshot.lastSeenAt);
  // An uncovered child gets no snapshot at all, so its steps are hidden. A
  // covered child keeps its step totals exactly as with enforcement off.
  let snapshot = allowed && snapshotCovered ? input.snapshot : null;
  if (snapshot && billingEnforced(child.organizationId)) {
    const locationAllowed = !snapshot.lastLocationAt || await snapshotLocationHasCoverage(child.organizationId, snapshot.lastLocationEventId);
    if (!locationAllowed) {
      snapshot = { ...snapshot, lastLatitude: null, lastLongitude: null, lastLocationLabel: null, lastLocationSource: null, lastLocationAccuracyMeters: null, lastLocationAt: null };
    }
  }
  const telemetry = deriveTelemetryState({
    lastSeenAt: snapshot?.lastSeenAt,
    lastDeviceState: snapshot?.lastDeviceState ?? null,
    status: snapshot?.status,
    statusLabel: snapshot?.statusLabel,
  });
  const connectivity = deriveConnectivityState({
    deviceStatus: device?.status ?? null,
    lastDeviceState: snapshot?.lastDeviceState ?? null,
    lastGpsConnected: snapshot?.lastGpsConnected ?? null,
    lastGpsFixAt: snapshot?.lastGpsFixAt ?? null,
    lastSeenAt: snapshot?.lastSeenAt ?? null,
  });
  const hasValidLocation = Boolean(
    snapshot?.lastLocationAt
    && snapshot.lastLocationSource
    && snapshot.lastLocationSource !== "none",
  );
  const resolvedPosition = hasValidLocation
    ? {
      latitude: Number(snapshot!.lastLatitude),
      longitude: Number(snapshot!.lastLongitude),
      source: snapshot!.lastLocationSource as "gps" | "cell" | "network",
      accuracyMeters: toNumberOrNull(snapshot!.lastLocationAccuracyMeters),
      observedAt: snapshot!.lastLocationAt!.toISOString(),
    }
    : null;

  return {
    id: child.id,
    name: child.name,
    initials: toInitials(child.name),
    avatarUrl: await resolveAvatarUrl(child.avatarUrl),
    status: telemetry.status,
    telemetryState: telemetry.telemetryState,
    connectivity,
    statusLabel: allowed ? telemetry.statusLabel : "Subscription required",
    locationLabel: hasValidLocation ? snapshot?.lastLocationLabel ?? null : null,
    lastSeenAt: toIsoString(snapshot?.lastSeenAt),
    lastUpdatedAt: toIsoString(snapshot?.lastLocationAt),
    etaLabel: null,
    batteryPercent: snapshot?.lastBatteryPercent ?? null,
    batteryVoltageMv: snapshot?.lastBatteryVoltageMv ?? null,
    batteryText: snapshot?.lastBatteryPercent !== null && snapshot?.lastBatteryPercent !== undefined
      ? `${snapshot.lastBatteryPercent}%`
      : null,
    signalStrength: snapshot?.lastSignalStrength ?? null,
    satelliteCount: snapshot?.lastSatelliteCount ?? null,
    stepCounter: snapshot?.lastRawStepCounter ?? null,
    stepDelta: snapshot?.lastStepDelta ?? 0,
    stepsThisHour: snapshot?.stepsThisHour ?? 0,
    stepsToday: snapshot?.stepsToday ?? 0,
    stepsTodayDate: snapshot?.stepsTodayDate ?? null,
    deviceTimezone: snapshot?.deviceTimezone ?? null,
    latitude: hasValidLocation ? toNumberOrNull(snapshot?.lastLatitude) : null,
    longitude: hasValidLocation ? toNumberOrNull(snapshot?.lastLongitude) : null,
    resolvedPosition,
    activePlan,
    deviceSummary: toDeviceSummary(allowed || !device ? device : { ...device, lastSeenAt: null }),
  };
}

export function toChildGeofenceDto(geofence: GeofenceRecord): ChildGeofenceDto {
  if (!geofence) {
    return {
      status: "unset",
      containmentState: "unknown",
      breachedAt: null,
      lastReenteredAt: null,
      lastEvaluatedAt: null,
      lastDistanceMeters: null,
      centerLatitude: null,
      centerLongitude: null,
      radiusMeters: null,
      updatedAt: null,
    };
  }

  return {
    status: geofence.status,
    containmentState: geofence.containmentState,
    breachedAt: toIsoString(geofence.breachedAt),
    lastReenteredAt: toIsoString(geofence.lastReenteredAt),
    lastEvaluatedAt: toIsoString(geofence.lastEvaluatedAt),
    lastDistanceMeters: toNumberOrNull(geofence.lastDistanceMeters),
    centerLatitude: toNumberOrNull(geofence.centerLatitude),
    centerLongitude: toNumberOrNull(geofence.centerLongitude),
    radiusMeters: geofence.radiusMeters,
    updatedAt: toIsoString(geofence.updatedAt),
  };
}

export async function toOverviewChildDto(input: {
  child: ChildRecord;
  snapshot: SnapshotRecord;
  device: DeviceRecord;
  activePlan: ActiveSubscriptionDto | null;
  geofence: GeofenceRecord;
}): Promise<OverviewChildDto> {
  return {
    ...(await toChildSummaryDto(input)),
    geofence: toChildGeofenceDto(input.geofence),
  };
}

export async function toChildDetailDto(input: {
  child: ChildRecord;
  snapshot: SnapshotRecord;
  device: DeviceRecord;
  activePlan: ActiveSubscriptionDto | null;
  schoolPlace?: PlaceRecord;
}): Promise<ChildDetailDto> {
  const { child, schoolPlace } = input;

  return {
    id: child.id,
    parentUserId: child.parentUserId,
    organizationId: child.organizationId,
    name: child.name,
    avatarUrl: await resolveAvatarUrl(child.avatarUrl),
    schoolName: child.schoolName,
    schoolPlace: toPlaceDto(schoolPlace ?? null),
    gender: child.gender,
    dateOfBirth: child.dateOfBirth,
    lifecycleStatus: child.status,
    summary: await toChildSummaryDto(input),
    createdAt: child.createdAt.toISOString(),
    updatedAt: child.updatedAt.toISOString(),
  };
}
