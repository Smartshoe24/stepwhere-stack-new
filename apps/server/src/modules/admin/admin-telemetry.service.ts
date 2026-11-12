import { addDays, format, parseISO } from "date-fns";
import { and, desc, eq, gte, isNull, lt, ne, sql, type SQL } from "drizzle-orm";
import type {
  AdminActivityQuery,
  AdminDeviceLiveTelemetryDto,
  AdminLocationEventDto,
  AdminLocationEventListResponseDto,
  AdminLocationEventsListQuery,
  ChildTrailGeometryRequestMode,
  ChildTrailResponseDto,
  ChildActivityResponseDto,
} from "@stepwhere/types";

import { db } from "../../db/client";
import {
  childDeviceBindings,
  childStatusSnapshots,
  children,
  devices,
  locationEvents,
} from "../../db/schema";
import { notFound } from "../../shared/errors";
import { toNumberOrNull } from "../../shared/mappers";
import { getChildActivityForOrganization } from "../activity/activity.service";
import { getAdminChildById } from "./admin-children.service";
import { getChildTrailForOrganization } from "../telemetry/telemetry.service";
import { deriveConnectivityState } from "../telemetry/telemetry.helpers";

function buildLocationDateFilters(
  column: typeof locationEvents.occurredAt,
  query: Pick<AdminLocationEventsListQuery, "startDate" | "endDate">,
) {
  const filters: SQL[] = [];

  if (query.startDate) {
    filters.push(gte(column, new Date(`${query.startDate}T00:00:00.000Z`)));
  }

  if (query.endDate) {
    const nextDay = format(addDays(parseISO(query.endDate), 1), "yyyy-MM-dd");
    filters.push(lt(column, new Date(`${nextDay}T00:00:00.000Z`)));
  }

  return filters;
}

async function getChildOrganizationRecord(childId: string) {
  const [child] = await db
    .select({
      id: children.id,
      organizationId: children.organizationId,
    })
    .from(children)
    .where(eq(children.id, childId))
    .limit(1);

  if (!child) {
    throw notFound("NOT_FOUND", "Child not found.");
  }

  return child;
}

async function mapLocationEventRow(row: {
  event: typeof locationEvents.$inferSelect;
  child: typeof children.$inferSelect | null;
  device: typeof devices.$inferSelect | null;
}): Promise<AdminLocationEventDto> {
  return {
    id: row.event.id,
    deviceId: row.event.deviceId,
    childId: row.event.childId,
    child: row.child
      ? {
        id: row.child.id,
        name: row.child.name,
      }
      : null,
    device: row.device
      ? {
        id: row.device.id,
        hardwareIdentifier: row.device.hardwareIdentifier,
        displayName: row.device.displayName,
      }
      : null,
    latitude: Number(row.event.latitude),
    longitude: Number(row.event.longitude),
    gpsConnected: row.event.gpsConnected,
    source: row.event.locationSource,
    locationLabel: row.event.locationLabel,
    accuracyMeters: toNumberOrNull(row.event.accuracyMeters),
    batteryPercent: row.event.batteryPercent,
    batteryVoltageMv: row.event.batteryVoltageMv,
    signalStrength: row.event.signalStrength,
    satelliteCount: row.event.satelliteCount,
    stepCounter: row.event.stepCounter,
    deviceState: row.event.deviceState,
    occurredAt: row.event.occurredAt.toISOString(),
    ingestedAt: row.event.ingestedAt.toISOString(),
  };
}

export async function getAdminChildActivity(
  childId: string,
  query: AdminActivityQuery,
): Promise<ChildActivityResponseDto> {
  const child = await getChildOrganizationRecord(childId);
  return getChildActivityForOrganization(child.organizationId, childId, query);
}

export async function getAdminChildTrail(
  childId: string,
  distanceMeters = 2_000,
  geometry: ChildTrailGeometryRequestMode = "roads",
): Promise<ChildTrailResponseDto> {
  const child = await getChildOrganizationRecord(childId);
  return getChildTrailForOrganization(child.organizationId, childId, distanceMeters, geometry);
}

export async function listAdminChildLocationEvents(
  childId: string,
  query: AdminLocationEventsListQuery,
): Promise<AdminLocationEventListResponseDto> {
  await getChildOrganizationRecord(childId);
  const page = query.page ?? 1;
  const pageSize = Math.min(query.pageSize ?? 20, 100);
  const offset = (page - 1) * pageSize;
  const dateFilters = buildLocationDateFilters(locationEvents.occurredAt, query);
  const where = and(eq(locationEvents.childId, childId), ...dateFilters);

  const rows = await db
    .select({
      event: locationEvents,
      child: children,
      device: devices,
    })
    .from(locationEvents)
    .leftJoin(children, eq(children.id, locationEvents.childId))
    .leftJoin(devices, eq(devices.id, locationEvents.deviceId))
    .where(where)
    .orderBy(desc(locationEvents.occurredAt))
    .limit(pageSize)
    .offset(offset);

  const [countRow] = await db
    .select({ total: sql<number>`count(*)` })
    .from(locationEvents)
    .where(where);

  const items = await Promise.all(rows.map(mapLocationEventRow));
  const total = Number(countRow?.total ?? 0);

  return {
    items,
    page,
    pageSize,
    total,
    hasMore: offset + items.length < total,
  };
}

async function getDeviceContext(deviceId: string) {
  const [row] = await db
    .select({
      device: devices,
      binding: childDeviceBindings,
      child: children,
      snapshot: childStatusSnapshots,
    })
    .from(devices)
    .leftJoin(
      childDeviceBindings,
      and(eq(childDeviceBindings.deviceId, devices.id), isNull(childDeviceBindings.unboundAt)),
    )
    .leftJoin(children, eq(children.id, childDeviceBindings.childId))
    .leftJoin(childStatusSnapshots, eq(childStatusSnapshots.childId, children.id))
    .where(eq(devices.id, deviceId))
    .limit(1);

  if (!row) {
    throw notFound("NOT_FOUND", "Device not found.");
  }

  return row;
}

export async function getAdminDeviceLiveTelemetry(
  deviceId: string,
): Promise<AdminDeviceLiveTelemetryDto> {
  const context = await getDeviceContext(deviceId);
  const [[latestEvent], [latestValidEvent]] = await Promise.all([
    db
      .select()
      .from(locationEvents)
      .where(eq(locationEvents.deviceId, deviceId))
      .orderBy(desc(locationEvents.occurredAt))
      .limit(1),
    db
      .select()
      .from(locationEvents)
      .where(and(eq(locationEvents.deviceId, deviceId), ne(locationEvents.locationSource, "none")))
      .orderBy(desc(locationEvents.occurredAt))
      .limit(1),
  ]);

  const adminChild = context.child ? await getAdminChildById(context.child.id) : null;
  const deviceState = latestEvent?.deviceState
    ?? (context.snapshot?.lastSeenAt ? "connecting" : "offline");
  const connectivity = deriveConnectivityState({
    deviceStatus: context.device.status,
    lastDeviceState: context.snapshot?.lastDeviceState ?? null,
    lastGpsConnected: context.snapshot?.lastGpsConnected ?? null,
    lastGpsFixAt: context.snapshot?.lastGpsFixAt ?? null,
    lastSeenAt: context.snapshot?.lastSeenAt ?? context.device.lastSeenAt,
  });

  return {
    device: {
      id: context.device.id,
      hardwareIdentifier: context.device.hardwareIdentifier,
      displayName: context.device.displayName,
      platform: context.device.platform,
      status: context.device.status,
      lastSeenAt: context.device.lastSeenAt?.toISOString() ?? null,
      createdAt: context.device.createdAt.toISOString(),
      updatedAt: context.device.updatedAt.toISOString(),
      activeBinding: context.binding && context.child
        ? {
          id: context.binding.id,
          childId: context.child.id,
          childName: context.child.name,
          childAvatarUrl: context.child.avatarUrl,
          organizationId: context.child.organizationId,
          boundAt: context.binding.boundAt.toISOString(),
        }
        : null,
      reservation: {
        reservedByUserId: context.device.reservedByUserId,
        reservedByOrganizationId: context.device.reservedByOrganizationId,
        reservedUntil: context.device.reservedUntil?.toISOString() ?? null,
      },
    },
    child: adminChild,
    location: {
      latitude: latestValidEvent ? Number(latestValidEvent.latitude) : toNumberOrNull(context.snapshot?.lastLatitude),
      longitude: latestValidEvent ? Number(latestValidEvent.longitude) : toNumberOrNull(context.snapshot?.lastLongitude),
      source: latestValidEvent?.locationSource === "none"
        ? null
        : latestValidEvent?.locationSource
          ?? (context.snapshot?.lastLocationSource === "none" ? null : context.snapshot?.lastLocationSource ?? null),
      label: latestValidEvent?.locationLabel ?? context.snapshot?.lastLocationLabel ?? null,
      accuracyMeters: latestValidEvent ? toNumberOrNull(latestValidEvent.accuracyMeters) : null,
      occurredAt: latestValidEvent?.occurredAt.toISOString() ?? connectivity.lastGpsFixAt,
      ingestedAt: latestValidEvent?.ingestedAt.toISOString() ?? null,
    },
    battery: {
      percent: latestEvent?.batteryPercent ?? context.snapshot?.lastBatteryPercent ?? null,
      voltageMv: latestEvent?.batteryVoltageMv ?? context.snapshot?.lastBatteryVoltageMv ?? null,
    },
    signal: {
      strength: latestEvent?.signalStrength ?? context.snapshot?.lastSignalStrength ?? null,
      satelliteCount: latestEvent?.satelliteCount ?? context.snapshot?.lastSatelliteCount ?? null,
    },
    motion: {
      stepCounter: latestEvent?.stepCounter ?? context.snapshot?.lastRawStepCounter ?? null,
      stepDelta: context.snapshot?.lastStepDelta ?? 0,
      stepsThisHour: context.snapshot?.stepsThisHour ?? 0,
    },
    state: {
      deviceState,
      trackingStatus: context.snapshot?.status ?? null,
      lastSeenAt: context.device.lastSeenAt?.toISOString() ?? null,
      gsmState: connectivity.gsmState,
      gpsState: connectivity.gpsState,
      lastGpsFixAt: connectivity.lastGpsFixAt,
    },
  };
}

export async function listAdminDeviceLocationEvents(
  deviceId: string,
  query: AdminLocationEventsListQuery,
): Promise<AdminLocationEventListResponseDto> {
  await getDeviceContext(deviceId);
  const page = query.page ?? 1;
  const pageSize = Math.min(query.pageSize ?? 20, 100);
  const offset = (page - 1) * pageSize;
  const dateFilters = buildLocationDateFilters(locationEvents.occurredAt, query);
  const where = and(eq(locationEvents.deviceId, deviceId), ...dateFilters);

  const rows = await db
    .select({
      event: locationEvents,
      child: children,
      device: devices,
    })
    .from(locationEvents)
    .leftJoin(children, eq(children.id, locationEvents.childId))
    .leftJoin(devices, eq(devices.id, locationEvents.deviceId))
    .where(where)
    .orderBy(desc(locationEvents.occurredAt))
    .limit(pageSize)
    .offset(offset);

  const [countRow] = await db
    .select({ total: sql<number>`count(*)` })
    .from(locationEvents)
    .where(where);
  const items = await Promise.all(rows.map(mapLocationEventRow));
  const total = Number(countRow?.total ?? 0);

  return {
    items,
    page,
    pageSize,
    total,
    hasMore: offset + items.length < total,
  };
}
