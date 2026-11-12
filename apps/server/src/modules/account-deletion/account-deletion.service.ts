import { randomInt } from "node:crypto";

import { and, asc, count, desc, eq, gt, inArray, isNull, or, sql } from "drizzle-orm";
import type {
  AccountDeletionChallengeDto,
  AccountDeletionConfirmationDto,
  AccountDeletionImpactDto,
  ConfirmAccountDeletionInput,
} from "@stepwhere/types";

import { db } from "../../db/client";
import {
  accountDeletionChallenges,
  accountDeletionRequests,
  childDeviceBindings,
  childShareLinks,
  children,
  members,
  organizations,
  pushInstallations,
  sessions,
  users,
} from "../../db/schema";
import { sendAccountDeletionSmsOtp } from "../../infrastructure/twilio";
import { generateOpaqueToken, sha256 } from "../../shared/crypto";
import { AppError, conflict, notFound } from "../../shared/errors";
import { getPlayReviewOtpForUser } from "../play-review/play-review-access.service";
import { realtimeRegistry } from "../realtime/realtime.service";
import { publicShareRealtimeRegistry } from "../shares/share-realtime.service";

const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const RESEND_COOLDOWN_MS = 30 * 1000;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const USER_RATE_LIMIT = 5;
const IP_RATE_LIMIT = 20;
const MAX_ATTEMPTS = 5;
const UNDO_WINDOW_MS = 72 * 60 * 60 * 1000;
const PURGE_DEADLINE_MS = 30 * 24 * 60 * 60 * 1000;

type DbExecutor = typeof db | any;

function getRequestIp(headers: Headers) {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() || "unknown";
  }
  return headers.get("x-real-ip")?.trim() || "unknown";
}

function getFamilyName(organization: typeof organizations.$inferSelect | null) {
  if (!organization) {
    return null;
  }

  const metadata = organization.metadata as Record<string, unknown> | null;
  return typeof metadata?.familyName === "string" ? metadata.familyName : organization.name;
}

export async function getAccountDeletionImpact(
  userId: string,
  executor: DbExecutor = db,
): Promise<AccountDeletionImpactDto> {
  const [membership] = await executor
    .select({ member: members, organization: organizations })
    .from(members)
    .innerJoin(organizations, eq(organizations.id, members.organizationId))
    .where(eq(members.userId, userId))
    .orderBy(asc(members.createdAt), asc(members.id))
    .limit(1);

  if (!membership) {
    return {
      childCount: 0,
      familyMemberCount: 0,
      familyName: null,
      isFamilyAdmin: false,
      scope: "user_only",
      shoeCount: 0,
      trackingStops: false,
      willTransferAdmin: false,
    };
  }

  const organizationId = membership.organization.id;
  const [[memberCount], [childCount], [shoeCount]] = await Promise.all([
    executor.select({ total: count() }).from(members)
      .where(eq(members.organizationId, organizationId)),
    executor.select({ total: count() }).from(children)
      .where(eq(children.organizationId, organizationId)),
    executor.select({ total: count() })
      .from(childDeviceBindings)
      .innerJoin(children, eq(children.id, childDeviceBindings.childId))
      .where(and(
        eq(children.organizationId, organizationId),
        isNull(childDeviceBindings.unboundAt),
      )),
  ]);

  const familyMemberCount = memberCount?.total ?? 0;
  const isFamilyAdmin = membership.member.role === "admin";
  const scope = isFamilyAdmin && familyMemberCount === 1 ? "family" : "user_only";

  return {
    childCount: childCount?.total ?? 0,
    familyMemberCount,
    familyName: getFamilyName(membership.organization),
    isFamilyAdmin,
    scope,
    shoeCount: shoeCount?.total ?? 0,
    trackingStops: scope === "family",
    willTransferAdmin: isFamilyAdmin && familyMemberCount > 1,
  };
}

async function enforceChallengeRateLimits(userId: string, requestIpHash: string) {
  const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MS);
  const [[userCount], [ipCount]] = await Promise.all([
    db.select({ total: count() }).from(accountDeletionChallenges).where(and(
      eq(accountDeletionChallenges.userId, userId),
      gt(accountDeletionChallenges.createdAt, windowStart),
    )),
    db.select({ total: count() }).from(accountDeletionChallenges).where(and(
      eq(accountDeletionChallenges.requestIpHash, requestIpHash),
      gt(accountDeletionChallenges.createdAt, windowStart),
    )),
  ]);

  if ((userCount?.total ?? 0) >= USER_RATE_LIMIT || (ipCount?.total ?? 0) >= IP_RATE_LIMIT) {
    throw conflict("Too many deletion-code requests. Try again later.");
  }
}

export async function createAccountDeletionChallenge(input: {
  headers: Headers;
  userId: string;
}): Promise<AccountDeletionChallengeDto> {
  const [user] = await db.select().from(users).where(eq(users.id, input.userId)).limit(1);
  if (!user) {
    throw notFound("NOT_FOUND", "User not found.");
  }

  const [pendingRequest] = await db
    .select({ id: accountDeletionRequests.id })
    .from(accountDeletionRequests)
    .where(and(
      eq(accountDeletionRequests.userId, input.userId),
      inArray(accountDeletionRequests.status, ["pending", "purging"]),
    ))
    .limit(1);
  if (pendingRequest) {
    throw new AppError(409, "ACCOUNT_DELETION_PENDING", "Account deletion is already pending.");
  }

  const [activeChallenge] = await db
    .select()
    .from(accountDeletionChallenges)
    .where(and(
      eq(accountDeletionChallenges.userId, input.userId),
      isNull(accountDeletionChallenges.consumedAt),
      gt(accountDeletionChallenges.expiresAt, new Date()),
    ))
    .orderBy(desc(accountDeletionChallenges.createdAt))
    .limit(1);
  if (activeChallenge && activeChallenge.resendAvailableAt > new Date()) {
    throw conflict("Wait before requesting another deletion code.", {
      expiresAt: activeChallenge.expiresAt.toISOString(),
      resendAvailableAt: activeChallenge.resendAvailableAt.toISOString(),
    });
  }

  const requestIpHash = sha256(getRequestIp(input.headers));
  await enforceChallengeRateLimits(input.userId, requestIpHash);

  const reviewOtp = await getPlayReviewOtpForUser({
    phoneNumber: user.phoneNumber,
    userId: user.id,
  });
  const code = reviewOtp ?? randomInt(0, 1_000_000).toString().padStart(6, "0");
  const challengeToken = generateOpaqueToken(24);
  const now = new Date();
  const [challenge] = await db.insert(accountDeletionChallenges).values({
    userId: user.id,
    phoneNumber: user.phoneNumber,
    codeHash: sha256(code),
    tokenHash: sha256(challengeToken),
    requestIpHash,
    expiresAt: new Date(now.getTime() + CHALLENGE_TTL_MS),
    resendAvailableAt: new Date(now.getTime() + RESEND_COOLDOWN_MS),
    updatedAt: now,
  }).returning();

  if (!reviewOtp) {
    await sendAccountDeletionSmsOtp({ phoneNumber: user.phoneNumber, code });
  } else {
    console.info("[store-review] issued fixed account-deletion OTP", {
      reviewerAccount: true,
    });
  }

  return {
    challengeToken,
    expiresAt: challenge.expiresAt.toISOString(),
    impact: await getAccountDeletionImpact(user.id),
    phoneNumber: user.phoneNumber,
    resendAvailableAt: challenge.resendAvailableAt.toISOString(),
  };
}

async function validateChallenge(userId: string, input: ConfirmAccountDeletionInput) {
  const [challenge] = await db
    .select()
    .from(accountDeletionChallenges)
    .where(and(
      eq(accountDeletionChallenges.userId, userId),
      eq(accountDeletionChallenges.tokenHash, sha256(input.challengeToken)),
    ))
    .limit(1);

  if (!challenge || challenge.consumedAt) {
    throw new AppError(400, "ACCOUNT_DELETION_CODE_INVALID", "Deletion challenge is invalid or already used.");
  }
  if (challenge.expiresAt <= new Date()) {
    throw new AppError(410, "ACCOUNT_DELETION_CHALLENGE_EXPIRED", "Deletion challenge has expired.");
  }
  if (challenge.attemptCount >= MAX_ATTEMPTS) {
    throw new AppError(400, "ACCOUNT_DELETION_CODE_INVALID", "Too many incorrect attempts. Request a new code.");
  }
  if (challenge.codeHash !== sha256(input.code.trim())) {
    await db.update(accountDeletionChallenges).set({
      attemptCount: challenge.attemptCount + 1,
      updatedAt: new Date(),
    }).where(eq(accountDeletionChallenges.id, challenge.id));
    throw new AppError(400, "ACCOUNT_DELETION_CODE_INVALID", "Deletion code is invalid.");
  }
  return challenge;
}

export async function confirmAccountDeletion(input: {
  body: ConfirmAccountDeletionInput;
  userId: string;
}): Promise<AccountDeletionConfirmationDto> {
  const challenge = await validateChallenge(input.userId, input.body);

  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${input.userId}))`);

    const [user] = await tx.select().from(users).where(eq(users.id, input.userId)).limit(1);
    if (!user) {
      throw notFound("NOT_FOUND", "User not found.");
    }

    const [existing] = await tx.select().from(accountDeletionRequests).where(and(
      eq(accountDeletionRequests.userId, input.userId),
      inArray(accountDeletionRequests.status, ["pending", "purging"]),
    )).limit(1);
    if (existing) {
      throw new AppError(409, "ACCOUNT_DELETION_PENDING", "Account deletion is already pending.");
    }

    const impact = await getAccountDeletionImpact(input.userId, tx);
    const [membership] = await tx
      .select()
      .from(members)
      .where(eq(members.userId, input.userId))
      .orderBy(asc(members.createdAt), asc(members.id))
      .limit(1);
    const organizationId = membership?.organizationId ?? null;
    let adminTransferredToUserId: string | null = null;

    if (impact.willTransferAdmin && membership && organizationId) {
      const [nextAdmin] = await tx
        .select()
        .from(members)
        .where(and(
          eq(members.organizationId, organizationId),
          sql`${members.userId} <> ${input.userId}`,
        ))
        .orderBy(asc(members.createdAt), asc(members.id))
        .limit(1);

      if (!nextAdmin) {
        throw conflict("A new family admin could not be selected.");
      }

      await tx.update(members).set({ role: "member" }).where(eq(members.id, membership.id));
      await tx.update(members).set({ role: "admin" }).where(eq(members.id, nextAdmin.id));
      await tx.update(children).set({
        parentUserId: nextAdmin.userId,
        updatedAt: new Date(),
      }).where(and(
        eq(children.organizationId, organizationId),
        eq(children.parentUserId, input.userId),
      ));
      adminTransferredToUserId = nextAdmin.userId;
    }

    const requestedAt = new Date();
    const undoUntil = new Date(requestedAt.getTime() + UNDO_WINDOW_MS);
    const purgeBy = new Date(requestedAt.getTime() + PURGE_DEADLINE_MS);
    const [request] = await tx.insert(accountDeletionRequests).values({
      userId: input.userId,
      organizationId,
      adminTransferredToUserId,
      scope: impact.scope,
      status: "pending",
      requestedAt,
      undoUntil,
      purgeBy,
      nextAttemptAt: undoUntil,
      updatedAt: requestedAt,
    }).returning();

    await tx.update(accountDeletionChallenges).set({
      consumedAt: requestedAt,
      updatedAt: requestedAt,
    }).where(eq(accountDeletionChallenges.id, challenge.id));
    await tx.delete(sessions).where(eq(sessions.userId, input.userId));
    await tx.delete(pushInstallations).where(eq(pushInstallations.userId, input.userId));
    const revokedShares = await tx.update(childShareLinks).set({
      status: "revoked",
      revokedAt: requestedAt,
      updatedAt: requestedAt,
    }).where(and(
      eq(childShareLinks.status, "active"),
      or(
        eq(childShareLinks.createdByUserId, input.userId),
        impact.scope === "family" && organizationId
          ? sql`${childShareLinks.childId} IN (SELECT id FROM children WHERE organization_id = ${organizationId})`
          : sql`false`,
      ),
    )).returning({ id: childShareLinks.id });

    return {
      revokedShareIds: revokedShares.map((share) => share.id),
      response: {
        adminTransferred: Boolean(adminTransferredToUserId),
        purgeBy: request.purgeBy.toISOString(),
        requestedAt: request.requestedAt.toISOString(),
        scope: request.scope,
        trackingStopped: impact.trackingStops,
        undoUntil: request.undoUntil.toISOString(),
      } satisfies AccountDeletionConfirmationDto,
    };
  });

  realtimeRegistry.disconnectUser(input.userId, "account_deletion_pending");
  // Telemetry keeps flowing for a user_only deletion, so open viewers would
  // otherwise keep receiving live location until their next poll.
  await publicShareRealtimeRegistry.endShares(result.revokedShareIds, "stopped");
  return result.response;
}

export async function getActiveAccountDeletion(userId: string) {
  const [request] = await db.select().from(accountDeletionRequests).where(and(
    eq(accountDeletionRequests.userId, userId),
    inArray(accountDeletionRequests.status, ["pending", "purging"]),
  )).orderBy(desc(accountDeletionRequests.requestedAt)).limit(1);
  return request ?? null;
}

export async function assertAccountAccessAllowed(userId: string) {
  const request = await getActiveAccountDeletion(userId);
  if (!request) {
    return;
  }

  const finalizing = request.undoUntil <= new Date() || request.status === "purging";
  throw new AppError(
    403,
    finalizing ? "ACCOUNT_DELETION_FINALIZING" : "ACCOUNT_DELETION_PENDING",
    finalizing
      ? "Account deletion is being finalized."
      : "Account deletion is pending. Sign in again before the undo deadline to restore it.",
    {
      purgeBy: request.purgeBy.toISOString(),
      undoUntil: request.undoUntil.toISOString(),
    },
  );
}

export async function assertSigninCanStart(userId: string) {
  const request = await getActiveAccountDeletion(userId);
  if (!request || request.undoUntil > new Date()) {
    return;
  }
  throw new AppError(410, "ACCOUNT_DELETION_FINALIZING", "Account deletion can no longer be undone.", {
    purgeBy: request.purgeBy.toISOString(),
  });
}

export async function restoreAccountDeletionOnSignin(userId: string) {
  const request = await getActiveAccountDeletion(userId);
  if (!request) {
    return false;
  }
  if (request.status !== "pending" || request.undoUntil <= new Date()) {
    throw new AppError(410, "ACCOUNT_DELETION_FINALIZING", "Account deletion can no longer be undone.");
  }

  await db.update(accountDeletionRequests).set({
    status: "cancelled",
    cancelledAt: new Date(),
    leaseExpiresAt: null,
    lastError: null,
    updatedAt: new Date(),
  }).where(and(
    eq(accountDeletionRequests.id, request.id),
    eq(accountDeletionRequests.status, "pending"),
  ));

  console.info("[account-deletion] deletion restored during sign-in", {
    requestId: request.id,
    scope: request.scope,
  });
  return true;
}

export async function isOrganizationDeletionPending(organizationId: string) {
  const [request] = await db.select({ id: accountDeletionRequests.id }).from(accountDeletionRequests).where(and(
    eq(accountDeletionRequests.organizationId, organizationId),
    eq(accountDeletionRequests.scope, "family"),
    inArray(accountDeletionRequests.status, ["pending", "purging"]),
  )).limit(1);
  return Boolean(request);
}
