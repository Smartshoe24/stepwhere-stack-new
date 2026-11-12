import { and, asc, count, desc, eq, ilike, inArray, isNotNull, isNull, or, type SQL, ne } from "drizzle-orm";
import type {
  AdminBanUserInput,
  AdminChildDetailDto,
  AdminCreateChildForUserInput,
  AdminChildRelationshipSummaryDto,
  AdminChildListItemDto,
  AdminUserChildRelationshipDto,
  AdminUserDetailDto,
  AdminUserListItemDto,
  AdminUserListResponseDto,
  AdminUsersListQuery,
  AdminUpdateUserInput,
  UserProfileDto,
  UpdateMeInput,
} from "@stepwhere/types";

import { db } from "../../db/client";
import { claimDevice } from "../billing/billing-ownership.service";
import { accounts, childDeviceBindings, childStatusSnapshots, children, devices, users } from "../../db/schema";
import { badRequest, conflict, notFound } from "../../shared/errors";
import { findFamilyMembershipForUser, getFamilyContextForUser } from "../../modules/family/family.service";
import { toIsoString } from "../../shared/mappers";
import { toChildDetailDto } from "../children/children.mapper";
import { getActiveSubscriptionForChild } from "../plans/plans.service";
import { buildPaginatedResponse, parseAdminListQuery } from "../admin/admin-list-query";
import {
  assertUserAvatarOwnership,
  ensureStoredAvatarExists,
  isStoredAvatarPath,
  resolveAvatarUrl,
} from "../uploads/uploads.service";
import { deriveTelemetryState } from "../telemetry/telemetry.helpers";

export async function toUserProfileDto(
  user: typeof users.$inferSelect,
  options?: {
    headers?: Headers;
    activeOrganizationId?: string | null;
  },
): Promise<UserProfileDto> {
  return {
    id: user.id,
    displayName: user.name,
    email: user.email,
    emailVerified: user.emailVerified,
    phoneNumber: user.phoneNumber,
    avatarUrl: await resolveAvatarUrl(user.image),
    currentAddress: user.currentAddress,
    dateOfBirth: user.dateOfBirth,
    onboardingCompleted: user.onboardingCompleted,
    role: user.role,
    status: user.status,
    banned: user.banned,
    banReason: user.banReason,
    banExpires: toIsoString(user.banExpires),
    lastSeenAt: toIsoString(user.lastSeenAt),
    family: await getFamilyContextForUser({
      userId: user.id,
      headers: options?.headers,
      activeOrganizationId: options?.activeOrganizationId,
    }),
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

export async function getUserProfile(
  userId: string,
  options?: {
    headers?: Headers;
    activeOrganizationId?: string | null;
  },
) {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);

  if (!user) {
    throw notFound("NOT_FOUND", "User not found.");
  }

  return toUserProfileDto(user, options);
}

export async function updateUserProfile(
  userId: string,
  input: UpdateMeInput,
  options?: {
    headers?: Headers;
    activeOrganizationId?: string | null;
  },
) {
  if (input.avatarUrl && isStoredAvatarPath(input.avatarUrl)) {
    assertUserAvatarOwnership({
      userId,
      path: input.avatarUrl,
    });
    await ensureStoredAvatarExists(input.avatarUrl);
  }

  const [user] = await db
    .update(users)
    .set({
      name: input.displayName,
      image: input.avatarUrl,
      currentAddress: input.currentAddress,
      dateOfBirth: input.dateOfBirth,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId))
    .returning();

  if (!user) {
    throw notFound("NOT_FOUND", "User not found.");
  }

  return toUserProfileDto(user, options);
}

export async function listUsers() {
  const rows = await db.select().from(users).orderBy(users.createdAt);
  return Promise.all(rows.map((row) => toUserProfileDto(row)));
}

const USER_SORTS = [
  "createdAt",
  "displayName",
  "phoneNumber",
  "lastSeenAt",
  "role",
  "status",
] as const;

type UserSort = typeof USER_SORTS[number];

function toUserOrderBy(sort: UserSort, dir: "asc" | "desc") {
  const order = dir === "asc" ? asc : desc;

  switch (sort) {
    case "displayName":
      return order(users.name);
    case "phoneNumber":
      return order(users.phoneNumber);
    case "lastSeenAt":
      return order(users.lastSeenAt);
    case "role":
      return order(users.role);
    case "status":
      return order(users.status);
    case "createdAt":
    default:
      return order(users.createdAt);
  }
}

async function mapAdminChildRow(row: {
  child: typeof children.$inferSelect;
  snapshot: typeof childStatusSnapshots.$inferSelect | null;
  device: typeof devices.$inferSelect | null;
  parent?: typeof users.$inferSelect | null;
}): Promise<AdminChildListItemDto> {
  const activePlan = await getActiveSubscriptionForChild(row.child.id);
  return {
    ...(await toChildDetailDto({
      child: row.child,
      snapshot: row.snapshot,
      device: row.device,
      activePlan,
    })),
    parent: row.parent
      ? {
        id: row.parent.id,
        displayName: row.parent.name,
        phoneNumber: row.parent.phoneNumber,
        email: row.parent.email,
        avatarUrl: row.parent.image,
      }
      : null,
  };
}

type AdminUserChildPreviewRow = {
  child: typeof children.$inferSelect;
  snapshot: typeof childStatusSnapshots.$inferSelect | null;
  device: typeof devices.$inferSelect | null;
};

async function toAdminChildRelationshipSummary(
  row: AdminUserChildPreviewRow,
): Promise<AdminChildRelationshipSummaryDto> {
  const telemetry = deriveTelemetryState({
    lastSeenAt: row.snapshot?.lastSeenAt,
    lastDeviceState: row.snapshot?.lastDeviceState ?? null,
    status: row.snapshot?.status,
    statusLabel: row.snapshot?.statusLabel,
  });

  return {
    id: row.child.id,
    name: row.child.name,
    avatarUrl: await resolveAvatarUrl(row.child.avatarUrl),
    lifecycleStatus: row.child.status,
    trackingStatus: telemetry.status,
    telemetryState: telemetry.telemetryState,
    activeDevice: row.device
      ? {
        id: row.device.id,
        hardwareIdentifier: row.device.hardwareIdentifier,
        displayName: row.device.displayName,
        status: row.device.status,
      }
      : null,
  };
}

function compareUserChildPreviewRows(a: AdminUserChildPreviewRow, b: AdminUserChildPreviewRow) {
  if (a.child.status !== b.child.status) {
    return a.child.status === "active" ? -1 : 1;
  }

  return b.child.createdAt.getTime() - a.child.createdAt.getTime();
}

async function buildUserChildRelationshipMap(
  userIds: string[],
): Promise<Map<string, AdminUserChildRelationshipDto>> {
  const byUserId = new Map<string, AdminUserChildRelationshipDto>();

  if (userIds.length === 0) {
    return byUserId;
  }

  const childRows = await db
    .select({
      child: children,
      snapshot: childStatusSnapshots,
      device: devices,
    })
    .from(children)
    .leftJoin(childStatusSnapshots, eq(childStatusSnapshots.childId, children.id))
    .leftJoin(
      childDeviceBindings,
      and(eq(childDeviceBindings.childId, children.id), isNull(childDeviceBindings.unboundAt)),
    )
    .leftJoin(devices, eq(devices.id, childDeviceBindings.deviceId))
    .where(inArray(children.parentUserId, userIds));

  const grouped = new Map<string, AdminUserChildPreviewRow[]>();
  for (const row of childRows) {
    const parentUserId = row.child.parentUserId;
    if (!parentUserId) {
      continue;
    }

    const existing = grouped.get(parentUserId);
    if (existing) {
      existing.push(row);
      continue;
    }

    grouped.set(parentUserId, [row]);
  }

  for (const userId of userIds) {
    const rows = grouped.get(userId) ?? [];
    const previewChildren = await Promise.all(
      rows.sort(compareUserChildPreviewRows).slice(0, 3).map(toAdminChildRelationshipSummary),
    );

    byUserId.set(userId, {
      count: rows.length,
      previewChildren,
    });
  }

  return byUserId;
}

export async function listAdminUsers(input: AdminUsersListQuery): Promise<AdminUserListResponseDto> {
  const query = parseAdminListQuery(input, {
    defaultSort: "createdAt",
    allowedSorts: USER_SORTS,
  });

  const filters: SQL[] = [];

  if (query.search) {
    const pattern = `%${query.search}%`;
    filters.push(or(
      ilike(users.name, pattern),
      ilike(users.phoneNumber, pattern),
      ilike(users.email, pattern),
    ) as SQL);
  }

  if (input.role) {
    filters.push(eq(users.role, input.role));
  }

  if (input.status) {
    filters.push(eq(users.status, input.status));
  }

  if (input.banned === "true") {
    filters.push(eq(users.banned, true));
  } else if (input.banned === "false") {
    filters.push(eq(users.banned, false));
  }

  if (input.onboarding === "completed") {
    filters.push(eq(users.onboardingCompleted, true));
  } else if (input.onboarding === "incomplete") {
    filters.push(eq(users.onboardingCompleted, false));
  }

  const where = filters.length > 0 ? and(...filters) : undefined;

  const [totalRow] = await db
    .select({ total: count() })
    .from(users)
    .where(where);

  const rows = await db
    .select()
    .from(users)
    .where(where)
    .orderBy(toUserOrderBy(query.sort, query.dir), desc(users.id))
    .limit(query.pageSize)
    .offset(query.offset);

  const [profiles, childRelationshipMap] = await Promise.all([
    Promise.all(rows.map((row) => toUserProfileDto(row))),
    buildUserChildRelationshipMap(rows.map((row) => row.id)),
  ]);

  const items: AdminUserListItemDto[] = profiles.map((profile) => ({
    ...profile,
    childRelationship: childRelationshipMap.get(profile.id) ?? {
      count: 0,
      previewChildren: [],
    },
  }));

  return buildPaginatedResponse({
    items,
    page: query.page,
    pageSize: query.pageSize,
    total: totalRow?.total ?? 0,
  });
}

export async function getUserById(userId: string) {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);

  if (!user) {
    throw notFound("NOT_FOUND", "User not found.");
  }

  return toUserProfileDto(user);
}

export async function getAdminUserById(userId: string): Promise<AdminUserDetailDto> {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);

  if (!user) {
    throw notFound("NOT_FOUND", "User not found.");
  }

  const childRows = await db
    .select({
      child: children,
      snapshot: childStatusSnapshots,
      device: devices,
    })
    .from(children)
    .leftJoin(childStatusSnapshots, eq(childStatusSnapshots.childId, children.id))
    .leftJoin(
      childDeviceBindings,
      and(eq(childDeviceBindings.childId, children.id), isNull(childDeviceBindings.unboundAt)),
    )
    .leftJoin(devices, eq(devices.id, childDeviceBindings.deviceId))
    .where(eq(children.parentUserId, userId))
    .orderBy(desc(children.createdAt), desc(children.id));

  const mappedChildren = await Promise.all(
    childRows.map((row) => mapAdminChildRow({ ...row, parent: user })),
  );

  return {
    ...(await toUserProfileDto(user)),
    children: mappedChildren,
  };
}

export async function updateAdminUser(userId: string, input: AdminUpdateUserInput) {
  if (input.role === "admin") {
    const [existingEmailAdmin] = await db
      .select({ id: users.id })
      .from(users)
      .innerJoin(
        accounts,
        and(
          eq(accounts.userId, users.id),
          eq(accounts.providerId, "credential"),
          isNotNull(accounts.password),
        ),
      )
      .where(and(eq(users.id, userId), eq(users.role, "admin")))
      .limit(1);

    if (!existingEmailAdmin) {
      throw conflict("Stepwhere supports a single email admin account.");
    }
  }

  const [user] = await db
    .update(users)
    .set({
      role: input.role,
      status: input.status,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId))
    .returning();

  if (!user) {
    throw notFound("NOT_FOUND", "User not found.");
  }

  return toUserProfileDto(user);
}

export async function createAdminChildForUser(
  userId: string,
  input: AdminCreateChildForUserInput,
): Promise<AdminChildDetailDto> {
  const name = input.name.trim();

  if (!name) {
    throw badRequest("Name is required.");
  }

  const membership = await findFamilyMembershipForUser(userId);
  if (!membership) {
    throw conflict("This user must belong to a family before adding a child.");
  }

  const childId = await db.transaction(async (tx) => {
    const [user] = await tx.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) {
      throw notFound("NOT_FOUND", "User not found.");
    }

    const [device] = await tx.select().from(devices).where(eq(devices.id, input.deviceId)).limit(1).for("update");
    if (!device) {
      throw notFound("NOT_FOUND", "Device not found.");
    }

    const [activeBinding] = await tx
      .select({ id: childDeviceBindings.id })
      .from(childDeviceBindings)
      .where(and(eq(childDeviceBindings.deviceId, device.id), isNull(childDeviceBindings.unboundAt)))
      .limit(1);

    if (device.status === "blocked") {
      throw conflict("This device is blocked.");
    }

    if (activeBinding || device.status === "active") {
      throw conflict("This device is already attached to a child.");
    }

    const [child] = await tx
      .insert(children)
      .values({
        parentUserId: user.id,
        organizationId: membership.organization.id,
        name,
        avatarUrl: input.avatarUrl?.trim() || null,
        schoolName: input.schoolName?.trim() || null,
        gender: input.gender?.trim() || null,
        dateOfBirth: input.dateOfBirth || null,
        status: input.lifecycleStatus ?? "active",
      })
      .returning({ id: children.id });

    await tx.insert(childDeviceBindings).values({
      childId: child.id,
      deviceId: device.id,
    });
    // Same ownership/trial path as onboarding and admin bind: refuses a shoe
    // owned by another family (409 DEVICE_BOUND_ELSEWHERE), records the claim
    // and starts the physical-device trial on first activation.
    await claimDevice(tx, device.id, membership.organization.id, user.id);

    await tx.update(devices).set({
      status: "active",
      reservedByUserId: null,
      reservedByOrganizationId: null,
      reservationTokenHash: null,
      reservedUntil: null,
      updatedAt: new Date(),
    }).where(eq(devices.id, device.id));

    return child.id;
  });

  const child = await import("../admin/admin-children.service").then((module) =>
    module.getAdminChildById(childId)
  );

  if (!child) {
    throw notFound("NOT_FOUND", "Child not found.");
  }

  return child;
}

export async function banAdminUser(userId: string, input: AdminBanUserInput) {
  const now = new Date();
  const [user] = await db
    .update(users)
    .set({
      banned: true,
      banReason: input.banReason?.trim() || "No reason",
      banExpires: input.banExpiresIn ? new Date(now.getTime() + input.banExpiresIn * 1000) : null,
      updatedAt: now,
    })
    .where(eq(users.id, userId))
    .returning();

  if (!user) {
    throw notFound("NOT_FOUND", "User not found.");
  }

  return toUserProfileDto(user);
}

export async function unbanAdminUser(userId: string) {
  const [user] = await db
    .update(users)
    .set({
      banned: false,
      banReason: null,
      banExpires: null,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId))
    .returning();

  if (!user) {
    throw notFound("NOT_FOUND", "User not found.");
  }

  return toUserProfileDto(user);
}

export async function markOnboardingCompleted(userId: string) {
  await db
    .update(users)
    .set({
      onboardingCompleted: true,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));
}

export async function markOnboardingIncomplete(userId: string) {
  await db
    .update(users)
    .set({
      onboardingCompleted: false,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));
}

export async function markOnboardingCompletedIfOrganizationHasChild(userId: string, organizationId: string) {
  const [activeChild] = await db
    .select({ id: children.id })
    .from(children)
    .where(and(eq(children.organizationId, organizationId), eq(children.status, "active")))
    .limit(1);

  if (!activeChild) {
    return false;
  }

  await markOnboardingCompleted(userId);
  return true;
}
