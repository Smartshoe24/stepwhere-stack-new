import { and, asc, count, desc, eq, gte, ilike, inArray, isNull, lt, or, sql, type SQL } from "drizzle-orm";
import type {
  AdminAcknowledgeGeofenceBreachInput,
  AdminBulkAcknowledgeGeofenceBreachesInput,
  AdminGeofenceBreachCountsDto,
  AdminGeofenceBreachesListQuery,
  AdminGeofenceDetailDto,
  AdminGeofenceEventDto,
  AdminGeofenceEventListResponseDto,
  AdminGeofenceEventsListQuery,
  AdminGeofenceListItemDto,
  AdminGeofenceListResponseDto,
  AdminGeofencesListQuery,
} from "@stepwhere/types";

import { db } from "../../db/client";
import {
  adminGeofenceEventAcknowledgments,
  childDeviceBindings,
  childGeofences,
  childStatusSnapshots,
  children,
  devices,
  geofenceEvents,
  locationEvents,
  organizations,
  users,
} from "../../db/schema";
import { notFound } from "../../shared/errors";
import { toNumberOrNull } from "../../shared/mappers";
import { buildPaginatedResponse, parseAdminListQuery } from "./admin-list-query";
import { toAdminDeviceDto } from "../devices/devices.service";

async function ensureGeofenceRows() {
  const rows = await db
    .select({
      childId: children.id,
      organizationId: children.organizationId,
    })
    .from(children)
    .leftJoin(childGeofences, eq(childGeofences.childId, children.id))
    .where(isNull(childGeofences.id));

  if (rows.length === 0) {
    return;
  }

  await db.insert(childGeofences).values(
    rows.map((row) => ({
      childId: row.childId,
      organizationId: row.organizationId,
      status: "disabled" as const,
    })),
  );
}

type GeofenceRow = {
  geofence: typeof childGeofences.$inferSelect;
  child: typeof children.$inferSelect;
  snapshot: typeof childStatusSnapshots.$inferSelect | null;
  binding: typeof childDeviceBindings.$inferSelect | null;
  device: typeof devices.$inferSelect | null;
  organization: typeof organizations.$inferSelect;
};

function toFamilyRelation(organization: typeof organizations.$inferSelect) {
  const metadata = (organization.metadata ?? null) as Record<string, unknown> | null;

  return {
    id: organization.id,
    name: organization.name,
    slug: organization.slug,
    familyName: typeof metadata?.familyName === "string" ? metadata.familyName : null,
    logo: organization.logo ?? null,
  };
}

async function getUnacknowledgedBreachCounts(geofenceIds: string[]) {
  const counts = new Map<string, number>();

  if (geofenceIds.length === 0) {
    return counts;
  }

  const rows = await db
    .select({
      geofenceId: geofenceEvents.geofenceId,
      total: count(),
    })
    .from(geofenceEvents)
    .leftJoin(
      adminGeofenceEventAcknowledgments,
      eq(adminGeofenceEventAcknowledgments.geofenceEventId, geofenceEvents.id),
    )
    .where(and(
      inArray(geofenceEvents.geofenceId, geofenceIds),
      eq(geofenceEvents.eventType, "breached"),
      isNull(adminGeofenceEventAcknowledgments.id),
    ))
    .groupBy(geofenceEvents.geofenceId);

  for (const row of rows) {
    counts.set(row.geofenceId, row.total);
  }

  return counts;
}

function toAdminGeofenceDto(
  row: GeofenceRow,
  unacknowledgedBreachCount: number,
): AdminGeofenceListItemDto {
  return {
    id: row.geofence.id,
    childId: row.child.id,
    childName: row.child.name,
    activeDevice: row.device && row.binding && row.child
      ? toAdminDeviceDto({
        device: row.device,
        binding: row.binding,
        child: row.child,
      })
      : null,
    family: toFamilyRelation(row.organization),
    status: row.geofence.status,
    containmentState: row.geofence.containmentState,
    lastLatitude: toNumberOrNull(row.snapshot?.lastLatitude),
    lastLongitude: toNumberOrNull(row.snapshot?.lastLongitude),
    centerLatitude: toNumberOrNull(row.geofence.centerLatitude),
    centerLongitude: toNumberOrNull(row.geofence.centerLongitude),
    radiusMeters: row.geofence.radiusMeters,
    lastDistanceMeters: toNumberOrNull(row.geofence.lastDistanceMeters),
    breachedAt: row.geofence.breachedAt?.toISOString() ?? null,
    lastReenteredAt: row.geofence.lastReenteredAt?.toISOString() ?? null,
    lastEvaluatedAt: row.geofence.lastEvaluatedAt?.toISOString() ?? null,
    unacknowledgedBreachCount,
    updatedAt: row.geofence.updatedAt?.toISOString() ?? null,
  };
}

const GEOFENCE_SORTS = [
  "updatedAt",
  "childName",
  "status",
  "containmentState",
] as const;

type GeofenceSort = typeof GEOFENCE_SORTS[number];

function toGeofenceOrderBy(sort: GeofenceSort, dir: "asc" | "desc") {
  const order = dir === "asc" ? asc : desc;

  switch (sort) {
    case "childName":
      return order(children.name);
    case "status":
      return order(childGeofences.status);
    case "containmentState":
      return order(childGeofences.containmentState);
    case "updatedAt":
    default:
      return order(childGeofences.updatedAt);
  }
}

function buildGeofenceFilters(input: AdminGeofencesListQuery, search: string) {
  const filters: SQL[] = [];

  if (search) {
    const pattern = `%${search}%`;
    filters.push(or(
      ilike(children.name, pattern),
      ilike(organizations.name, pattern),
      ilike(devices.hardwareIdentifier, pattern),
    ) as SQL);
  }

  if (input.status) {
    filters.push(eq(childGeofences.status, input.status === "unset" ? "disabled" : input.status));
  }

  if (input.containmentState) {
    filters.push(eq(childGeofences.containmentState, input.containmentState));
  }

  if (input.breachState === "breached") {
    filters.push(eq(childGeofences.containmentState, "outside"));
  }

  if (input.childId) {
    filters.push(eq(children.id, input.childId));
  }

  if (input.familyId) {
    filters.push(eq(children.organizationId, input.familyId));
  }

  return filters;
}

export async function listAdminGeofences(
  input: AdminGeofencesListQuery,
): Promise<AdminGeofenceListResponseDto> {
  await ensureGeofenceRows();
  const query = parseAdminListQuery(input, {
    defaultSort: "updatedAt",
    allowedSorts: GEOFENCE_SORTS,
  });

  const filters = buildGeofenceFilters(input, query.search);
  const where = filters.length > 0 ? and(...filters) : undefined;

  const [totalRow] = await db
    .select({ total: count() })
    .from(childGeofences)
    .innerJoin(children, eq(children.id, childGeofences.childId))
    .innerJoin(organizations, eq(organizations.id, childGeofences.organizationId))
    .leftJoin(childStatusSnapshots, eq(childStatusSnapshots.childId, children.id))
    .leftJoin(
      childDeviceBindings,
      and(eq(childDeviceBindings.childId, children.id), isNull(childDeviceBindings.unboundAt)),
    )
    .leftJoin(devices, eq(devices.id, childDeviceBindings.deviceId))
    .where(where);

  const rows = await db
    .select({
      geofence: childGeofences,
      child: children,
      snapshot: childStatusSnapshots,
      binding: childDeviceBindings,
      device: devices,
      organization: organizations,
    })
    .from(childGeofences)
    .innerJoin(children, eq(children.id, childGeofences.childId))
    .innerJoin(organizations, eq(organizations.id, childGeofences.organizationId))
    .leftJoin(childStatusSnapshots, eq(childStatusSnapshots.childId, children.id))
    .leftJoin(
      childDeviceBindings,
      and(eq(childDeviceBindings.childId, children.id), isNull(childDeviceBindings.unboundAt)),
    )
    .leftJoin(devices, eq(devices.id, childDeviceBindings.deviceId))
    .where(where)
    .orderBy(toGeofenceOrderBy(query.sort, query.dir), desc(childGeofences.id))
    .limit(query.pageSize)
    .offset(query.offset);

  const counts = await getUnacknowledgedBreachCounts(rows.map((row) => row.geofence.id));
  const items = rows.map((row) => toAdminGeofenceDto(row, counts.get(row.geofence.id) ?? 0));

  return buildPaginatedResponse({
    items,
    page: query.page,
    pageSize: query.pageSize,
    total: totalRow?.total ?? 0,
  });
}

export async function getAdminGeofenceById(
  geofenceId: string,
): Promise<AdminGeofenceDetailDto | null> {
  await ensureGeofenceRows();

  const [row] = await db
    .select({
      geofence: childGeofences,
      child: children,
      snapshot: childStatusSnapshots,
      binding: childDeviceBindings,
      device: devices,
      organization: organizations,
    })
    .from(childGeofences)
    .innerJoin(children, eq(children.id, childGeofences.childId))
    .innerJoin(organizations, eq(organizations.id, childGeofences.organizationId))
    .leftJoin(childStatusSnapshots, eq(childStatusSnapshots.childId, children.id))
    .leftJoin(
      childDeviceBindings,
      and(eq(childDeviceBindings.childId, children.id), isNull(childDeviceBindings.unboundAt)),
    )
    .leftJoin(devices, eq(devices.id, childDeviceBindings.deviceId))
    .where(eq(childGeofences.id, geofenceId))
    .limit(1);

  if (!row) {
    return null;
  }

  const counts = await getUnacknowledgedBreachCounts([row.geofence.id]);
  return toAdminGeofenceDto(row, counts.get(row.geofence.id) ?? 0);
}

async function mapAdminGeofenceEventRow(row: {
  event: typeof geofenceEvents.$inferSelect;
  child: typeof children.$inferSelect;
  device: typeof devices.$inferSelect | null;
  organization: typeof organizations.$inferSelect;
  ack: typeof adminGeofenceEventAcknowledgments.$inferSelect | null;
  acknowledgedBy: typeof users.$inferSelect | null;
}): Promise<AdminGeofenceEventDto> {
  return {
    id: row.event.id,
    geofenceId: row.event.geofenceId,
    child: {
      id: row.child.id,
      name: row.child.name,
    },
    device: row.device
      ? {
        id: row.device.id,
        hardwareIdentifier: row.device.hardwareIdentifier,
        displayName: row.device.displayName,
      }
      : null,
    family: toFamilyRelation(row.organization),
    eventType: row.event.eventType,
    latitude: toNumberOrNull(row.event.latitude),
    longitude: toNumberOrNull(row.event.longitude),
    distanceMeters: toNumberOrNull(row.event.distanceMeters),
    radiusMeters: row.event.radiusMeters,
    occurredAt: row.event.occurredAt.toISOString(),
    createdAt: row.event.createdAt.toISOString(),
    acknowledgment: row.ack && row.acknowledgedBy
      ? {
        acknowledgedAt: row.ack.acknowledgedAt.toISOString(),
        acknowledgedBy: {
          id: row.acknowledgedBy.id,
          displayName: row.acknowledgedBy.name,
          phoneNumber: row.acknowledgedBy.phoneNumber,
          email: row.acknowledgedBy.email,
          avatarUrl: row.acknowledgedBy.image,
        },
        note: row.ack.note,
      }
      : null,
  };
}

async function listGeofenceEventsInternal(input: {
  geofenceId?: string;
  acknowledged?: "true" | "false";
  childId?: string;
  deviceId?: string;
  familyId?: string;
  search?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  pageSize?: number;
  eventType?: "breached" | "reentered" | "reset";
  breachedOnly?: boolean;
}): Promise<AdminGeofenceEventListResponseDto> {
  const page = input.page ?? 1;
  const pageSize = Math.min(input.pageSize ?? 20, 100);
  const offset = (page - 1) * pageSize;
  const filters: SQL[] = [];

  if (input.geofenceId) {
    filters.push(eq(geofenceEvents.geofenceId, input.geofenceId));
  }

  if (input.childId) {
    filters.push(eq(geofenceEvents.childId, input.childId));
  }

  if (input.deviceId) {
    filters.push(eq(locationEvents.deviceId, input.deviceId));
  }

  if (input.familyId) {
    filters.push(eq(geofenceEvents.organizationId, input.familyId));
  }

  if (input.search) {
    const pattern = `%${input.search}%`;
    filters.push(or(
      ilike(children.name, pattern),
      ilike(devices.hardwareIdentifier, pattern),
      ilike(organizations.name, pattern),
    ) as SQL);
  }

  if (input.breachedOnly) {
    filters.push(eq(geofenceEvents.eventType, "breached"));
  } else if (input.eventType) {
    filters.push(eq(geofenceEvents.eventType, input.eventType));
  }

  if (input.acknowledged === "true") {
    filters.push(sql`${adminGeofenceEventAcknowledgments.id} IS NOT NULL`);
  } else if (input.acknowledged === "false") {
    filters.push(sql`${adminGeofenceEventAcknowledgments.id} IS NULL`);
  }

  if (input.startDate) {
    filters.push(gte(geofenceEvents.occurredAt, new Date(`${input.startDate}T00:00:00.000Z`)));
  }

  if (input.endDate) {
    filters.push(lt(geofenceEvents.occurredAt, new Date(`${input.endDate}T23:59:59.999Z`)));
  }

  const where = filters.length > 0 ? and(...filters) : undefined;

  const rows = await db
    .select({
      event: geofenceEvents,
      child: children,
      device: devices,
      organization: organizations,
      ack: adminGeofenceEventAcknowledgments,
      acknowledgedBy: users,
    })
    .from(geofenceEvents)
    .innerJoin(children, eq(children.id, geofenceEvents.childId))
    .innerJoin(organizations, eq(organizations.id, geofenceEvents.organizationId))
    .leftJoin(locationEvents, eq(locationEvents.id, geofenceEvents.locationEventId))
    .leftJoin(devices, eq(devices.id, locationEvents.deviceId))
    .leftJoin(
      adminGeofenceEventAcknowledgments,
      eq(adminGeofenceEventAcknowledgments.geofenceEventId, geofenceEvents.id),
    )
    .leftJoin(users, eq(users.id, adminGeofenceEventAcknowledgments.acknowledgedByUserId))
    .where(where)
    .orderBy(desc(geofenceEvents.occurredAt), desc(geofenceEvents.id))
    .limit(pageSize)
    .offset(offset);

  const [countRow] = await db
    .select({ total: count() })
    .from(geofenceEvents)
    .leftJoin(locationEvents, eq(locationEvents.id, geofenceEvents.locationEventId))
    .leftJoin(
      adminGeofenceEventAcknowledgments,
      eq(adminGeofenceEventAcknowledgments.geofenceEventId, geofenceEvents.id),
    )
    .where(where);

  return buildPaginatedResponse({
    items: await Promise.all(rows.map(mapAdminGeofenceEventRow)),
    page,
    pageSize,
    total: countRow?.total ?? 0,
  });
}

export function listAdminGeofenceEvents(
  geofenceId: string,
  query: AdminGeofenceEventsListQuery,
) {
  return listGeofenceEventsInternal({
    geofenceId,
    page: query.page,
    pageSize: query.pageSize,
    startDate: query.startDate,
    endDate: query.endDate,
    eventType: query.eventType,
  });
}

export function listAdminGeofenceBreaches(
  query: AdminGeofenceBreachesListQuery,
) {
  return listGeofenceEventsInternal({
    acknowledged: query.acknowledged,
    childId: query.childId,
    deviceId: query.deviceId,
    familyId: query.familyId,
    search: query.search,
    startDate: query.startDate,
    endDate: query.endDate,
    page: query.page,
    pageSize: query.pageSize,
    breachedOnly: true,
  });
}

export async function acknowledgeAdminGeofenceBreach(
  geofenceEventId: string,
  userId: string,
  input: AdminAcknowledgeGeofenceBreachInput,
) {
  await db
    .insert(adminGeofenceEventAcknowledgments)
    .values({
      geofenceEventId,
      acknowledgedByUserId: userId,
      note: input.note ?? null,
    })
    .onConflictDoNothing();
}

export async function acknowledgeAdminGeofenceBreaches(
  userId: string,
  input: AdminBulkAcknowledgeGeofenceBreachesInput,
) {
  if (input.eventIds.length === 0) {
    return;
  }

  await db
    .insert(adminGeofenceEventAcknowledgments)
    .values(
      input.eventIds.map((eventId) => ({
        geofenceEventId: eventId,
        acknowledgedByUserId: userId,
        note: input.note ?? null,
      })),
    )
    .onConflictDoNothing();
}

export async function getAdminGeofenceBreachCounts(): Promise<AdminGeofenceBreachCountsDto> {
  const [unacknowledgedRow, acknowledgedRow] = await Promise.all([
    db
      .select({ total: count() })
      .from(geofenceEvents)
      .leftJoin(
        adminGeofenceEventAcknowledgments,
        eq(adminGeofenceEventAcknowledgments.geofenceEventId, geofenceEvents.id),
      )
      .where(and(eq(geofenceEvents.eventType, "breached"), isNull(adminGeofenceEventAcknowledgments.id)))
      .then((rows) => rows[0]),
    db
      .select({ total: count() })
      .from(geofenceEvents)
      .innerJoin(
        adminGeofenceEventAcknowledgments,
        eq(adminGeofenceEventAcknowledgments.geofenceEventId, geofenceEvents.id),
      )
      .where(eq(geofenceEvents.eventType, "breached"))
      .then((rows) => rows[0]),
  ]);

  return {
    unacknowledged: unacknowledgedRow?.total ?? 0,
    acknowledged: acknowledgedRow?.total ?? 0,
  };
}
