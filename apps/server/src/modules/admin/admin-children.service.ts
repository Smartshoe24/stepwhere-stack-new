import { and, asc, count, desc, eq, ilike, isNull, or, type SQL } from "drizzle-orm";
import type {
  AdminChildDetailDto,
  AdminChildListItemDto,
  AdminChildListResponseDto,
  AdminChildrenListQuery,
  AdminChildParentDto,
  AdminUpdateChildInput,
} from "@stepwhere/types";

import { db } from "../../db/client";
import { childDeviceBindings, childStatusSnapshots, children, devices, users } from "../../db/schema";
import { badRequest, notFound } from "../../shared/errors";
import { toChildDetailDto } from "../children/children.mapper";
import { getActiveSubscriptionForChild } from "../plans/plans.service";
import { buildPaginatedResponse, parseAdminListQuery } from "./admin-list-query";

const CHILD_SORTS = [
  "createdAt",
  "name",
  "lastSeenAt",
  "lifecycleStatus",
] as const;

type ChildSort = typeof CHILD_SORTS[number];

type AdminChildRow = {
  child: typeof children.$inferSelect;
  snapshot: typeof childStatusSnapshots.$inferSelect | null;
  binding: typeof childDeviceBindings.$inferSelect | null;
  device: typeof devices.$inferSelect | null;
  parent: typeof users.$inferSelect | null;
};

function toChildOrderBy(sort: ChildSort, dir: "asc" | "desc") {
  const order = dir === "asc" ? asc : desc;

  switch (sort) {
    case "name":
      return order(children.name);
    case "lastSeenAt":
      return order(childStatusSnapshots.lastSeenAt);
    case "lifecycleStatus":
      return order(children.status);
    case "createdAt":
    default:
      return order(children.createdAt);
  }
}

function toParentSummary(parent: typeof users.$inferSelect | null): AdminChildParentDto {
  if (!parent) {
    return null;
  }

  return {
    id: parent.id,
    displayName: parent.name,
    phoneNumber: parent.phoneNumber,
    email: parent.email,
    avatarUrl: parent.image,
  };
}

async function toAdminChildListItem(row: AdminChildRow): Promise<AdminChildListItemDto> {
  const activePlan = await getActiveSubscriptionForChild(row.child.id);
  return {
    ...(await toChildDetailDto({
      child: row.child,
      snapshot: row.snapshot,
      device: row.device,
      activePlan,
    })),
    parent: toParentSummary(row.parent),
  };
}

async function toAdminChildDetail(row: AdminChildRow): Promise<AdminChildDetailDto> {
  const activePlan = await getActiveSubscriptionForChild(row.child.id);
  return {
    ...(await toChildDetailDto({
      child: row.child,
      snapshot: row.snapshot,
      device: row.device,
      activePlan,
    })),
    parent: toParentSummary(row.parent),
    deviceLink: {
      device: row.device ? {
        id: row.device.id,
        hardwareIdentifier: row.device.hardwareIdentifier,
        displayName: row.device.displayName,
        platform: row.device.platform,
        status: row.device.status,
        lastSeenAt: row.device.lastSeenAt?.toISOString() ?? null,
        createdAt: row.device.createdAt.toISOString(),
        updatedAt: row.device.updatedAt.toISOString(),
        activeBinding: row.binding
          ? {
            id: row.binding.id,
            childId: row.child.id,
            childName: row.child.name,
            childAvatarUrl: row.child.avatarUrl,
            organizationId: row.child.organizationId,
            boundAt: row.binding.boundAt.toISOString(),
          }
          : null,
        reservation: {
          reservedByUserId: row.device.reservedByUserId,
          reservedByOrganizationId: row.device.reservedByOrganizationId,
          reservedUntil: row.device.reservedUntil?.toISOString() ?? null,
        },
      } : null,
      bindingId: row.binding?.id ?? null,
      boundAt: row.binding?.boundAt.toISOString() ?? null,
    },
  };
}

function buildChildQueryFilters(input: AdminChildrenListQuery, search: string): SQL[] {
  const filters: SQL[] = [];

  if (search) {
    const pattern = `%${search}%`;
    filters.push(or(
      ilike(children.name, pattern),
      ilike(children.schoolName, pattern),
    ) as SQL);
  }

  if (input.lifecycleStatus) {
    filters.push(eq(children.status, input.lifecycleStatus));
  }

  if (input.trackingStatus) {
    filters.push(eq(childStatusSnapshots.status, input.trackingStatus));
  }

  if (input.binding === "bound") {
    filters.push(isNull(childDeviceBindings.unboundAt));
  } else if (input.binding === "unbound") {
    filters.push(isNull(childDeviceBindings.id));
  }

  return filters;
}

export async function listAdminChildren(input: AdminChildrenListQuery): Promise<AdminChildListResponseDto> {
  const query = parseAdminListQuery(input, {
    defaultSort: "createdAt",
    allowedSorts: CHILD_SORTS,
  });

  const filters = buildChildQueryFilters(input, query.search);
  const where = filters.length > 0 ? and(...filters) : undefined;

  const [totalRow] = await db
    .select({ total: count() })
    .from(children)
    .leftJoin(childStatusSnapshots, eq(childStatusSnapshots.childId, children.id))
    .leftJoin(
      childDeviceBindings,
      and(eq(childDeviceBindings.childId, children.id), isNull(childDeviceBindings.unboundAt)),
    )
    .where(where);

  const rows = await db
    .select({
      child: children,
      snapshot: childStatusSnapshots,
      binding: childDeviceBindings,
      device: devices,
      parent: users,
    })
    .from(children)
    .leftJoin(childStatusSnapshots, eq(childStatusSnapshots.childId, children.id))
    .leftJoin(
      childDeviceBindings,
      and(eq(childDeviceBindings.childId, children.id), isNull(childDeviceBindings.unboundAt)),
    )
    .leftJoin(devices, eq(devices.id, childDeviceBindings.deviceId))
    .leftJoin(users, eq(users.id, children.parentUserId))
    .where(where)
    .orderBy(toChildOrderBy(query.sort, query.dir), desc(children.id))
    .limit(query.pageSize)
    .offset(query.offset);

  let filteredRows = rows;
  if (input.telemetryState) {
    const { deriveTelemetryState } = await import("../telemetry/telemetry.helpers");
    filteredRows = rows.filter((row) => deriveTelemetryState({
      lastSeenAt: row.snapshot?.lastSeenAt,
      lastDeviceState: row.snapshot?.lastDeviceState ?? null,
      status: row.snapshot?.status,
      statusLabel: row.snapshot?.statusLabel,
    }).telemetryState === input.telemetryState);
  }

  const items = await Promise.all(filteredRows.map(toAdminChildListItem));

  return buildPaginatedResponse({
    items,
    page: query.page,
    pageSize: query.pageSize,
    total: totalRow?.total ?? 0,
  });
}

export async function getAdminChildById(childId: string): Promise<AdminChildDetailDto | null> {
  const [row] = await db
    .select({
      child: children,
      snapshot: childStatusSnapshots,
      binding: childDeviceBindings,
      device: devices,
      parent: users,
    })
    .from(children)
    .leftJoin(childStatusSnapshots, eq(childStatusSnapshots.childId, children.id))
    .leftJoin(
      childDeviceBindings,
      and(eq(childDeviceBindings.childId, children.id), isNull(childDeviceBindings.unboundAt)),
    )
    .leftJoin(devices, eq(devices.id, childDeviceBindings.deviceId))
    .leftJoin(users, eq(users.id, children.parentUserId))
    .where(eq(children.id, childId))
    .limit(1);

  return row ? toAdminChildDetail(row) : null;
}

export async function updateAdminChild(childId: string, input: AdminUpdateChildInput): Promise<AdminChildDetailDto> {
  const [existing] = await db
    .select({ id: children.id, organizationId: children.organizationId })
    .from(children)
    .where(eq(children.id, childId))
    .limit(1);

  if (!existing) {
    throw notFound("NOT_FOUND", "Child not found.");
  }

  const nextName = input.name?.trim();
  if (input.name !== undefined && !nextName) {
    throw badRequest("Name is required.");
  }

  await db
    .update(children)
    .set({
      name: nextName,
      avatarUrl: input.avatarUrl,
      schoolName: input.schoolName,
      gender: input.gender,
      dateOfBirth: input.dateOfBirth,
      status: input.lifecycleStatus,
      updatedAt: new Date(),
    })
    .where(eq(children.id, childId));

  const child = await getAdminChildById(childId);
  if (!child) {
    throw notFound("NOT_FOUND", "Child not found.");
  }

  return child;
}
