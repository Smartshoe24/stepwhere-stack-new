import { and, asc, count, desc, eq, gt, ilike, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import type {
  AdminChildListItemDto,
  AdminCreateFamilyInput,
  AdminFamiliesListQuery,
  AdminFamilyDetailDto,
  AdminFamilyListItemDto,
  AdminFamilyListResponseDto,
  AdminTransferFamilyAdminInput,
  AdminUserSummaryDto,
  FamilyQrInviteDto,
  FamilyContextDto,
  FamilyDto,
  FamilyJoinCodeDto,
  FamilyInviteKind,
  FamilyMemberDto,
  FamilyMemberRole,
  JoinFamilyPreviewDto,
  PublicFamilyInvitePreviewDto,
  LeaveFamilyResultDto,
  RemoveFamilyMemberResultDto,
} from "@stepwhere/types";

import { env } from "../../config/env";
import { db } from "../../db/client";
import {
  childDeviceBindings,
  childStatusSnapshots,
  children,
  devices,
  familyJoinCodes,
  members,
  organizations,
  users,
} from "../../db/schema";
import { auth } from "../../infrastructure/better-auth";
import { buildPaginatedResponse, parseAdminListQuery } from "../admin/admin-list-query";
import { toChildDetailDto } from "../children/children.mapper";
import { getActiveSubscriptionForChild } from "../plans/plans.service";
import { generateOpaqueToken, sha256 } from "../../shared/crypto";
import { AppError } from "../../shared/errors";
import { resolveAvatarUrl } from "../uploads/uploads.service";
import { markOnboardingCompleted, markOnboardingIncomplete } from "../users/users.service";
import { publicShareRealtimeRegistry } from "../shares/share-realtime.service";
import { revokeActiveShareLinksForOrganization } from "../shares/share-revocation";

type OrganizationRecord = typeof organizations.$inferSelect;
type MemberRecord = typeof members.$inferSelect;
type UserRecord = typeof users.$inferSelect;
type FamilyJoinCodeRecord = typeof familyJoinCodes.$inferSelect;

const FAMILY_MEMBER_LIMIT = 3;
const FAMILY_QR_INVITE_TTL_MS = 15 * 60 * 1000;

export function toFamilyDto(organization: OrganizationRecord): FamilyDto {
  const metadata = (organization.metadata ?? null) as Record<string, unknown> | null;

  return {
    id: organization.id,
    name: organization.name,
    slug: organization.slug,
    logo: organization.logo ?? null,
    familyName: typeof metadata?.familyName === "string" ? metadata.familyName : null,
    createdAt: organization.createdAt.toISOString(),
    updatedAt: organization.updatedAt?.toISOString() ?? null,
  };
}

export function toFamilyContextDto(input: {
  organization: OrganizationRecord | null;
  member: MemberRecord | null;
}): FamilyContextDto {
  const { organization, member } = input;
  const memberRole = member?.role === "admin" ? "admin" : member?.role === "member" ? "member" : null;
  const isAdmin = memberRole === "admin";

  return {
    organization: organization ? toFamilyDto(organization) : null,
    memberRole,
    permissions: {
      canManageChildren: isAdmin,
      canManageGeofences: Boolean(memberRole),
      canManageMembers: isAdmin,
      canManageJoinCodes: isAdmin,
      canCreateShareLinks: isAdmin,
    },
    requiresOnboarding: !organization || !member,
  };
}

async function toFamilyMemberDto(input: {
  member: MemberRecord;
  user: UserRecord;
}): Promise<FamilyMemberDto> {
  return {
    id: input.member.id,
    userId: input.member.userId,
    organizationId: input.member.organizationId,
    role: input.member.role as FamilyMemberRole,
    createdAt: input.member.createdAt.toISOString(),
    user: {
      id: input.user.id,
      displayName: input.user.name,
      phoneNumber: input.user.phoneNumber,
      email: input.user.email,
      avatarUrl: await resolveAvatarUrl(input.user.image),
    },
  };
}

function toAdminUserSummary(user: UserRecord): AdminUserSummaryDto {
  return {
    id: user.id,
    displayName: user.name,
    phoneNumber: user.phoneNumber,
    email: user.email,
    avatarUrl: user.image ?? null,
  };
}

type FamilyChildRow = {
  child: typeof children.$inferSelect;
  snapshot: typeof childStatusSnapshots.$inferSelect | null;
  device: typeof devices.$inferSelect | null;
  parent: typeof users.$inferSelect | null;
};

async function toAdminFamilyChildListItem(row: FamilyChildRow): Promise<AdminChildListItemDto> {
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

function slugifyFamilyName(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "family";
}

async function buildUniqueOrganizationSlug(familyName: string) {
  const baseSlug = slugifyFamilyName(familyName);
  const [existing] = await db.select({ total: count() }).from(organizations).where(eq(organizations.slug, baseSlug));

  if ((existing?.total ?? 0) === 0) {
    return baseSlug;
  }

  return `${baseSlug}-${generateOpaqueToken(4).toLowerCase()}`;
}

const FAMILY_SORTS = [
  "createdAt",
  "familyName",
] as const;

type FamilySort = typeof FAMILY_SORTS[number];

function toFamilyOrderBy(sort: FamilySort, dir: "asc" | "desc") {
  const order = dir === "asc" ? asc : desc;

  switch (sort) {
    case "familyName":
      return order(organizations.name);
    case "createdAt":
    default:
      return order(organizations.createdAt);
  }
}

function toFamilyNameFromMetadata(metadata: Record<string, unknown> | null | undefined) {
  return typeof metadata?.familyName === "string" ? metadata.familyName : null;
}

async function buildFamilyAggregateMaps(organizationIds: string[]) {
  const memberCountByOrganization = new Map<string, number>();
  const childCountByOrganization = new Map<string, number>();
  const activeJoinCodesByOrganization = new Map<string, number>();
  const adminByOrganization = new Map<string, AdminUserSummaryDto | null>();

  if (organizationIds.length === 0) {
    return {
      memberCountByOrganization,
      childCountByOrganization,
      activeJoinCodesByOrganization,
      adminByOrganization,
    };
  }

  const [memberCounts, childCounts, joinCodeCounts, adminRows] = await Promise.all([
    db
      .select({
        organizationId: members.organizationId,
        total: count(),
      })
      .from(members)
      .where(inArray(members.organizationId, organizationIds))
      .groupBy(members.organizationId),
    db
      .select({
        organizationId: children.organizationId,
        total: count(),
      })
      .from(children)
      .where(inArray(children.organizationId, organizationIds))
      .groupBy(children.organizationId),
    db
      .select({
        organizationId: familyJoinCodes.organizationId,
        total: count(),
      })
      .from(familyJoinCodes)
      .where(
        and(
          inArray(familyJoinCodes.organizationId, organizationIds),
          isNull(familyJoinCodes.revokedAt),
          isNull(familyJoinCodes.consumedAt),
          gt(familyJoinCodes.expiresAt, new Date()),
        ),
      )
      .groupBy(familyJoinCodes.organizationId),
    db
      .select({
        organizationId: members.organizationId,
        user: users,
      })
      .from(members)
      .innerJoin(users, eq(users.id, members.userId))
      .where(and(inArray(members.organizationId, organizationIds), eq(members.role, "admin"))),
  ]);

  for (const row of memberCounts) {
    memberCountByOrganization.set(row.organizationId, row.total);
  }

  for (const row of childCounts) {
    childCountByOrganization.set(row.organizationId, row.total);
  }

  for (const row of joinCodeCounts) {
    activeJoinCodesByOrganization.set(row.organizationId, row.total);
  }

  for (const row of adminRows) {
    adminByOrganization.set(row.organizationId, toAdminUserSummary(row.user));
  }

  return {
    memberCountByOrganization,
    childCountByOrganization,
    activeJoinCodesByOrganization,
    adminByOrganization,
  };
}

async function toAdminFamilyListItem(organization: OrganizationRecord, aggregates: Awaited<ReturnType<typeof buildFamilyAggregateMaps>>): Promise<AdminFamilyListItemDto> {
  const metadata = (organization.metadata ?? null) as Record<string, unknown> | null;

  return {
    id: organization.id,
    name: organization.name,
    slug: organization.slug,
    familyName: toFamilyNameFromMetadata(metadata),
    logo: organization.logo ?? null,
    admin: aggregates.adminByOrganization.get(organization.id) ?? null,
    memberCount: aggregates.memberCountByOrganization.get(organization.id) ?? 0,
    childCount: aggregates.childCountByOrganization.get(organization.id) ?? 0,
    activeJoinCodeCount: aggregates.activeJoinCodesByOrganization.get(organization.id) ?? 0,
    createdAt: organization.createdAt.toISOString(),
    updatedAt: organization.updatedAt?.toISOString() ?? null,
  };
}

export async function findFamilyMembershipForUser(userId: string, activeOrganizationId?: string | null) {
  if (activeOrganizationId) {
    const [membership] = await db
      .select({
        member: members,
        organization: organizations,
      })
      .from(members)
      .innerJoin(organizations, eq(organizations.id, members.organizationId))
      .where(and(eq(members.userId, userId), eq(members.organizationId, activeOrganizationId)))
      .limit(1);

    if (membership) {
      return membership;
    }
  }

  const memberships = await db
    .select({
      member: members,
      organization: organizations,
    })
    .from(members)
    .innerJoin(organizations, eq(organizations.id, members.organizationId))
    .where(eq(members.userId, userId))
    .limit(2);

  return memberships[0] ?? null;
}

export async function ensureActiveFamilyForUser(input: {
  userId: string;
  headers?: Headers;
  activeOrganizationId?: string | null;
}) {
  const membership = await findFamilyMembershipForUser(input.userId, input.activeOrganizationId);

  if (!membership) {
    throw new AppError(409, "ONBOARDING_REQUIRED", "Family onboarding is required.");
  }

  if (!input.activeOrganizationId && input.headers) {
    await auth.api.setActiveOrganization({
      headers: input.headers,
      body: {
        organizationId: membership.organization.id,
      },
    });
  }

  return membership;
}

async function ensureUserWithoutFamily(userId: string) {
  const [existing] = await db.select().from(members).where(eq(members.userId, userId)).limit(1);

  return existing ?? null;
}

function deriveFamilyNameFromDisplayName(displayName: string) {
  const trimmed = displayName.trim();

  if (!trimmed || /^\+\d+$/.test(trimmed)) {
    throw new AppError(409, "ONBOARDING_REQUIRED", "Complete your profile before starting a family.");
  }

  const firstName = trimmed.split(/\s+/)[0]?.trim();

  if (!firstName) {
    throw new AppError(409, "ONBOARDING_REQUIRED", "Complete your profile before starting a family.");
  }

  return `${firstName}'s family`;
}

export async function startFamily(input: {
  userId: string;
  headers: Headers;
}) {
  const existingMembership = await ensureUserWithoutFamily(input.userId);

  if (existingMembership) {
    const membership = await ensureActiveFamilyForUser({
      userId: input.userId,
      headers: input.headers,
      activeOrganizationId: existingMembership.organizationId,
    });

    return {
      family: toFamilyDto(membership.organization),
      context: toFamilyContextDto(membership),
    };
  }

  const [user] = await db.select().from(users).where(eq(users.id, input.userId)).limit(1);

  if (!user) {
    throw new AppError(404, "NOT_FOUND", "User not found.");
  }

  const familyName = deriveFamilyNameFromDisplayName(user.name);
  const slug = await buildUniqueOrganizationSlug(familyName);

  const organization = await auth.api.createOrganization({
    body: {
      userId: input.userId,
      name: familyName,
      slug,
      metadata: {
        kind: "family",
        familyName,
      },
    },
  });

  await auth.api.setActiveOrganization({
    headers: input.headers,
    body: {
      organizationId: organization.id,
    },
  });

  const membership = await ensureActiveFamilyForUser({
    userId: input.userId,
    headers: input.headers,
    activeOrganizationId: organization.id,
  });

  return {
    family: toFamilyDto(membership.organization),
    context: toFamilyContextDto(membership),
  };
}

export async function getFamilyContextForUser(input: {
  userId: string;
  headers?: Headers;
  activeOrganizationId?: string | null;
}) {
  const membership = await findFamilyMembershipForUser(input.userId, input.activeOrganizationId);

  if (!membership) {
    return toFamilyContextDto({
      organization: null,
      member: null,
    });
  }

  if (!input.activeOrganizationId && input.headers) {
    await auth.api.setActiveOrganization({
      headers: input.headers,
      body: {
        organizationId: membership.organization.id,
      },
    });
  }

  return toFamilyContextDto(membership);
}

export async function listFamilyMembers(organizationId: string) {
  const rows = await db
    .select({
      member: members,
      user: users,
    })
    .from(members)
    .innerJoin(users, eq(users.id, members.userId))
    .where(eq(members.organizationId, organizationId));

  return Promise.all(rows.map(toFamilyMemberDto));
}

export async function listAdminFamilies(input: AdminFamiliesListQuery): Promise<AdminFamilyListResponseDto> {
  const query = parseAdminListQuery(input, {
    defaultSort: "createdAt",
    allowedSorts: FAMILY_SORTS,
  });

  const filters: SQL[] = [];

  if (query.search) {
    const pattern = `%${query.search}%`;
    filters.push(
      or(
        ilike(organizations.name, pattern),
        ilike(organizations.slug, pattern),
        sql`coalesce(${organizations.metadata} ->> 'familyName', '') ilike ${pattern}`,
      ) as SQL,
    );
  }

  const where = filters.length > 0 ? and(...filters) : undefined;

  const [totalRow] = await db
    .select({ total: count() })
    .from(organizations)
    .where(where);

  const rows = await db
    .select()
    .from(organizations)
    .where(where)
    .orderBy(toFamilyOrderBy(query.sort, query.dir), desc(organizations.id))
    .limit(query.pageSize)
    .offset(query.offset);

  const organizationIds = rows.map((row) => row.id);
  const aggregates = await buildFamilyAggregateMaps(organizationIds);
  const items = await Promise.all(rows.map((row) => toAdminFamilyListItem(row, aggregates)));

  return buildPaginatedResponse({
    items,
    page: query.page,
    pageSize: query.pageSize,
    total: totalRow?.total ?? 0,
  });
}

async function listAdminFamilyChildren(organizationId: string): Promise<AdminChildListItemDto[]> {
  const rows = await db
    .select({
      child: children,
      snapshot: childStatusSnapshots,
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
    .where(eq(children.organizationId, organizationId))
    .orderBy(desc(children.createdAt), desc(children.id));

  return Promise.all(rows.map(toAdminFamilyChildListItem));
}

export async function getAdminFamilyById(familyId: string): Promise<AdminFamilyDetailDto | null> {
  const [organization] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, familyId))
    .limit(1);

  if (!organization) {
    return null;
  }

  const aggregates = await buildFamilyAggregateMaps([organization.id]);
  const [family, membersList, childrenList, joinCodes] = await Promise.all([
    toAdminFamilyListItem(organization, aggregates),
    listFamilyMembers(organization.id),
    listAdminFamilyChildren(organization.id),
    listActiveJoinCodes(organization.id),
  ]);

  return {
    ...family,
    members: membersList,
    children: childrenList,
    joinCodes,
  };
}

export async function createAdminFamily(input: AdminCreateFamilyInput): Promise<AdminFamilyDetailDto> {
  const familyName = input.familyName.trim();
  if (!familyName) {
    throw new AppError(400, "BAD_REQUEST", "Family name is required.");
  }

  const [user] = await db.select().from(users).where(eq(users.id, input.adminUserId)).limit(1);
  if (!user) {
    throw new AppError(404, "NOT_FOUND", "User not found.");
  }

  const existingMembership = await findFamilyMembershipForUser(user.id);
  if (existingMembership) {
    throw new AppError(409, "ALREADY_IN_FAMILY", "Selected user already belongs to a family.");
  }

  const slug = await buildUniqueOrganizationSlug(familyName);
  const organization = await auth.api.createOrganization({
    body: {
      userId: user.id,
      name: familyName,
      slug,
      metadata: {
        kind: "family",
        familyName,
      },
    },
  });

  const created = await getAdminFamilyById(organization.id);
  if (!created) {
    throw new AppError(404, "NOT_FOUND", "Family not found.");
  }

  return created;
}

export async function addAdminFamilyMember(
  familyId: string,
  input: { userId: string },
): Promise<AdminFamilyDetailDto> {
  const [organization, user] = await Promise.all([
    db.select().from(organizations).where(eq(organizations.id, familyId)).limit(1),
    db.select().from(users).where(eq(users.id, input.userId)).limit(1),
  ]);

  if (!organization[0]) {
    throw new AppError(404, "NOT_FOUND", "Family not found.");
  }

  if (!user[0]) {
    throw new AppError(404, "NOT_FOUND", "User not found.");
  }

  const existingMembership = await findFamilyMembershipForUser(input.userId);
  if (existingMembership) {
    throw new AppError(409, "ALREADY_IN_FAMILY", "Selected user already belongs to a family.");
  }

  await auth.api.addMember({
    body: {
      userId: input.userId,
      organizationId: familyId,
      role: "member",
    },
  });

  const updated = await getAdminFamilyById(familyId);
  if (!updated) {
    throw new AppError(404, "NOT_FOUND", "Family not found.");
  }

  return updated;
}

export async function transferAdminFamilyAdmin(
  familyId: string,
  input: AdminTransferFamilyAdminInput,
): Promise<AdminFamilyDetailDto> {
  await db.transaction(async (tx) => {
    const memberRows = await tx
      .select()
      .from(members)
      .where(eq(members.organizationId, familyId));

    const currentAdmin = memberRows.find((row) => row.role === "admin");
    const nextAdmin = memberRows.find((row) => row.userId === input.userId);

    if (!currentAdmin) {
      throw new AppError(404, "NOT_FOUND", "Family admin not found.");
    }

    if (!nextAdmin) {
      throw new AppError(404, "NOT_FOUND", "Selected user is not a family member.");
    }

    if (currentAdmin.id === nextAdmin.id) {
      return;
    }

    await tx.update(members).set({ role: "member" }).where(eq(members.id, currentAdmin.id));
    await tx.update(members).set({ role: "admin" }).where(eq(members.id, nextAdmin.id));
  });

  const updated = await getAdminFamilyById(familyId);
  if (!updated) {
    throw new AppError(404, "NOT_FOUND", "Family not found.");
  }

  return updated;
}

export async function getFamilyMemberById(organizationId: string, memberId: string) {
  const [row] = await db
    .select({
      member: members,
      user: users,
    })
    .from(members)
    .innerJoin(users, eq(users.id, members.userId))
    .where(and(eq(members.organizationId, organizationId), eq(members.id, memberId)))
    .limit(1);

  if (!row) {
    throw new AppError(404, "NOT_FOUND", "Family member not found.");
  }

  return toFamilyMemberDto(row);
}

async function getFamilyMemberRoleCount(organizationId: string) {
  const [memberCount] = await db
    .select({ total: count() })
    .from(members)
    .where(and(eq(members.organizationId, organizationId), eq(members.role, "member")));

  return memberCount?.total ?? 0;
}

function toFamilyJoinUrl(rawToken: string) {
  const origin = env.PUBLIC_SHARE_APP_URL.replace(/\/+$/, "");
  return `${origin}/family/join?token=${encodeURIComponent(rawToken)}`;
}

export async function createFamilyJoinCode(input: {
  organizationId: string;
  createdByUserId: string;
  phoneNumber: string;
  expiresAt?: Date | null;
}) {
  const memberCount = await getFamilyMemberRoleCount(input.organizationId);

  if (memberCount >= FAMILY_MEMBER_LIMIT) {
    throw new AppError(409, "FAMILY_MEMBER_LIMIT_REACHED", "Family already has the maximum number of members.");
  }

  const rawToken = generateOpaqueToken(24);
  const [joinCode] = await db
    .insert(familyJoinCodes)
    .values({
      organizationId: input.organizationId,
      inviteKind: "phone",
      invitedPhoneNumber: input.phoneNumber,
      tokenHash: sha256(rawToken),
      createdByUserId: input.createdByUserId,
      role: "member",
      expiresAt: input.expiresAt ?? new Date(Date.now() + 1000 * 60 * 60 * 24),
    })
    .returning();

  return toFamilyJoinCodeDto(joinCode, rawToken);
}

export async function createFamilyQrInvite(input: {
  organizationId: string;
  createdByUserId: string;
}): Promise<FamilyQrInviteDto> {
  const memberCount = await getFamilyMemberRoleCount(input.organizationId);

  if (memberCount >= FAMILY_MEMBER_LIMIT) {
    throw new AppError(409, "FAMILY_MEMBER_LIMIT_REACHED", "Family already has the maximum number of members.");
  }

  const rawToken = generateOpaqueToken(24);
  const [joinCode] = await db
    .insert(familyJoinCodes)
    .values({
      organizationId: input.organizationId,
      inviteKind: "qr",
      invitedPhoneNumber: null,
      tokenHash: sha256(rawToken),
      createdByUserId: input.createdByUserId,
      role: "member",
      expiresAt: new Date(Date.now() + FAMILY_QR_INVITE_TTL_MS),
    })
    .returning();

  return {
    id: joinCode.id,
    organizationId: joinCode.organizationId,
    token: rawToken,
    joinUrl: toFamilyJoinUrl(rawToken),
    role: "member",
    inviteKind: "qr",
    expiresAt: joinCode.expiresAt.toISOString(),
    createdAt: joinCode.createdAt.toISOString(),
  };
}

function toFamilyJoinCodeDto(record: FamilyJoinCodeRecord, rawToken: string | null): FamilyJoinCodeDto {
  return {
    id: record.id,
    organizationId: record.organizationId,
    phoneNumber: record.invitedPhoneNumber ?? null,
    token: rawToken,
    joinUrl: rawToken ? toFamilyJoinUrl(rawToken) : null,
    role: "member",
    inviteKind: (record.inviteKind === "qr" ? "qr" : "phone") satisfies FamilyInviteKind,
    expiresAt: record.expiresAt.toISOString(),
    consumedAt: record.consumedAt?.toISOString() ?? null,
    revokedAt: record.revokedAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
  };
}

export async function listActiveJoinCodes(organizationId: string) {
  const rows = await db
    .select()
    .from(familyJoinCodes)
    .where(and(eq(familyJoinCodes.organizationId, organizationId), isNull(familyJoinCodes.revokedAt), isNull(familyJoinCodes.consumedAt), gt(familyJoinCodes.expiresAt, new Date())));

  return rows.map((row) => toFamilyJoinCodeDto(row, null));
}

export async function previewJoinFamilyToken(token: string): Promise<JoinFamilyPreviewDto> {
  const tokenHash = sha256(token);
  const [row] = await db
    .select({
      joinCode: familyJoinCodes,
      organization: organizations,
    })
    .from(familyJoinCodes)
    .innerJoin(organizations, eq(organizations.id, familyJoinCodes.organizationId))
    .where(eq(familyJoinCodes.tokenHash, tokenHash))
    .limit(1);

  if (!row) {
    throw new AppError(404, "INVALID_JOIN_CODE", "Join code not found.");
  }

  const isValid = !row.joinCode.revokedAt && !row.joinCode.consumedAt && row.joinCode.expiresAt > new Date();

  return {
    organization: {
      id: row.organization.id,
      name: row.organization.name,
      slug: row.organization.slug,
      familyName: typeof (row.organization.metadata as Record<string, unknown> | null)?.familyName === "string"
        ? String((row.organization.metadata as Record<string, unknown>).familyName)
        : null,
    },
    role: "member",
    phoneNumber: row.joinCode.invitedPhoneNumber ?? null,
    inviteKind: row.joinCode.inviteKind === "qr" ? "qr" : "phone",
    expiresAt: row.joinCode.expiresAt.toISOString(),
    isValid,
  };
}

export async function previewPublicJoinFamilyToken(
  token: string,
  now = new Date(),
): Promise<PublicFamilyInvitePreviewDto> {
  const tokenHash = sha256(token);
  const [row] = await db
    .select({
      joinCode: familyJoinCodes,
      organization: organizations,
    })
    .from(familyJoinCodes)
    .innerJoin(organizations, eq(organizations.id, familyJoinCodes.organizationId))
    .where(eq(familyJoinCodes.tokenHash, tokenHash))
    .limit(1);

  if (!row || row.joinCode.revokedAt || row.joinCode.consumedAt) {
    return {
      familyName: null,
      role: null,
      expiresAt: null,
      status: "unavailable",
    };
  }

  const metadata = row.organization.metadata as Record<string, unknown> | null;
  const familyName = typeof metadata?.familyName === "string"
    ? metadata.familyName
    : row.organization.name;

  if (row.joinCode.expiresAt <= now) {
    return {
      familyName,
      role: "member",
      expiresAt: row.joinCode.expiresAt.toISOString(),
      status: "expired",
    };
  }

  return {
    familyName,
    role: "member",
    expiresAt: row.joinCode.expiresAt.toISOString(),
    status: "valid",
  };
}

export async function joinFamilyWithToken(input: {
  userId: string;
  headers: Headers;
  token: string;
}) {
  const existingMembership = await ensureUserWithoutFamily(input.userId);

  if (existingMembership) {
    throw new AppError(409, "ALREADY_IN_FAMILY", "User already belongs to a family.");
  }

  const [user] = await db.select().from(users).where(eq(users.id, input.userId)).limit(1);

  if (!user) {
    throw new AppError(404, "NOT_FOUND", "User not found.");
  }

  const tokenHash = sha256(input.token);
  const [row] = await db
    .select({
      joinCode: familyJoinCodes,
      organization: organizations,
    })
    .from(familyJoinCodes)
    .innerJoin(organizations, eq(organizations.id, familyJoinCodes.organizationId))
    .where(eq(familyJoinCodes.tokenHash, tokenHash))
    .limit(1);

  if (!row || row.joinCode.revokedAt || row.joinCode.consumedAt || row.joinCode.expiresAt <= new Date()) {
    throw new AppError(404, "INVALID_JOIN_CODE", "Join code is invalid or expired.");
  }

  if (row.joinCode.inviteKind !== "qr" && row.joinCode.invitedPhoneNumber !== user.phoneNumber) {
    throw new AppError(403, "INVALID_JOIN_CODE", "Join code does not match this phone number.");
  }

  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${input.userId}))`);

    const [lockedExistingMembership] = await tx
      .select({ id: members.id })
      .from(members)
      .where(eq(members.userId, input.userId))
      .limit(1);

    if (lockedExistingMembership) {
      throw new AppError(409, "ALREADY_IN_FAMILY", "User already belongs to a family.");
    }

    const [currentMemberCount] = await tx
      .select({ total: count() })
      .from(members)
      .where(and(eq(members.organizationId, row.organization.id), eq(members.role, "member")));

    if ((currentMemberCount?.total ?? 0) >= FAMILY_MEMBER_LIMIT) {
      throw new AppError(409, "FAMILY_MEMBER_LIMIT_REACHED", "Family already has the maximum number of members.");
    }

    const [consumed] = await tx
      .update(familyJoinCodes)
      .set({
        consumedAt: new Date(),
        consumedByUserId: input.userId,
        updatedAt: new Date(),
      })
      .where(and(eq(familyJoinCodes.id, row.joinCode.id), isNull(familyJoinCodes.consumedAt)))
      .returning({ id: familyJoinCodes.id });

    if (!consumed) {
      throw new AppError(409, "INVITE_ALREADY_USED", "This invite has already been used.");
    }

    await tx.insert(members).values({
      organizationId: row.organization.id,
      userId: input.userId,
      role: "member",
    });
  });

  await auth.api.setActiveOrganization({
    headers: input.headers,
    body: {
      organizationId: row.organization.id,
    },
  });

  await markOnboardingCompleted(input.userId);

  const membership = await ensureActiveFamilyForUser({
    userId: input.userId,
    headers: input.headers,
    activeOrganizationId: row.organization.id,
  });

  return {
    family: toFamilyDto(membership.organization),
    context: toFamilyContextDto(membership),
  };
}

export async function leaveCurrentFamily(input: {
  organizationId: string;
  memberId: string;
  userId: string;
  role: "admin" | "member";
  headers: Headers;
}): Promise<LeaveFamilyResultDto> {
  if (input.role === "admin") {
    const [activeChildCount] = await db
      .select({ total: count() })
      .from(children)
      .where(and(eq(children.organizationId, input.organizationId), eq(children.status, "active")));

    if ((activeChildCount?.total ?? 0) > 0) {
      throw new AppError(409, "FAMILY_HAS_CHILDREN", "Remove children before leaving this family.");
    }

    const [otherMembersCount] = await db
      .select({ total: count() })
      .from(members)
      .where(and(eq(members.organizationId, input.organizationId), sql`${members.id} <> ${input.memberId}`));

    if ((otherMembersCount?.total ?? 0) > 0) {
      throw new AppError(409, "FAMILY_HAS_MEMBERS", "Remove family members before leaving this family.");
    }

    // Archived children cascade-delete with the organization, and so do their
    // links. Collect the live ones first so open viewer sockets can be closed.
    const revokedShareIds = await db.transaction(async (tx) => {
      const ids = await revokeActiveShareLinksForOrganization(tx, input.organizationId);
      await tx.delete(organizations).where(eq(organizations.id, input.organizationId));
      return ids;
    });
    await publicShareRealtimeRegistry.endShares(revokedShareIds, "stopped");
  } else {
    await db
      .delete(members)
      .where(and(eq(members.id, input.memberId), eq(members.organizationId, input.organizationId), eq(members.userId, input.userId)));
  }

  await markOnboardingIncomplete(input.userId);

  return {
    left: true,
    nextOnboardingPath: "/onboarding/family",
  };
}

export async function revokeFamilyJoinCode(organizationId: string, tokenId: string) {
  const [row] = await db
    .update(familyJoinCodes)
    .set({
      revokedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(familyJoinCodes.id, tokenId), eq(familyJoinCodes.organizationId, organizationId)))
    .returning();

  if (!row) {
    throw new AppError(404, "NOT_FOUND", "Join code not found.");
  }

  return toFamilyJoinCodeDto(row, null);
}

export function toRemoveFamilyMemberResultDto(memberId: string): RemoveFamilyMemberResultDto {
  return {
    removed: true,
    memberId,
  };
}
