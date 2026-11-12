import { and, asc, eq, inArray, isNull, lt, lte, or, sql } from "drizzle-orm";

import { db } from "../../db/client";
import {
  accountDeletionRequests,
  childDeviceBindings,
  children,
  devices,
  feedbackSubmissions,
  organizations,
  phoneAuthChallenges,
  previewAccessEntries,
  users,
  verifications,
} from "../../db/schema";
import { getRedisClient } from "../../infrastructure/redis";
import {
  deleteStoredAvatarPaths,
  isStoredAvatarPath,
  listStoredAvatarPaths,
} from "../uploads/uploads.service";

const LEASE_MS = 15 * 60 * 1000;
const BATCH_SIZE = 10;

type DeletionRequest = typeof accountDeletionRequests.$inferSelect;

function nextRetryAt(attemptCount: number) {
  const delayMinutes = Math.min(60, 2 ** Math.min(attemptCount, 6));
  return new Date(Date.now() + delayMinutes * 60 * 1000);
}

function safeErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/[\r\n]+/g, " ").slice(0, 500);
}

async function claimNextRequest() {
  const now = new Date();
  const [candidate] = await db
    .select()
    .from(accountDeletionRequests)
    .where(and(
      inArray(accountDeletionRequests.status, ["pending", "purging"]),
      lte(accountDeletionRequests.undoUntil, now),
      lte(accountDeletionRequests.nextAttemptAt, now),
      or(
        isNull(accountDeletionRequests.leaseExpiresAt),
        lt(accountDeletionRequests.leaseExpiresAt, now),
      ),
    ))
    .orderBy(asc(accountDeletionRequests.nextAttemptAt), asc(accountDeletionRequests.id))
    .limit(1);

  if (!candidate) {
    return null;
  }

  const [claimed] = await db
    .update(accountDeletionRequests)
    .set({
      status: "purging",
      leaseExpiresAt: new Date(now.getTime() + LEASE_MS),
      updatedAt: now,
    })
    .where(and(
      eq(accountDeletionRequests.id, candidate.id),
      inArray(accountDeletionRequests.status, ["pending", "purging"]),
      or(
        isNull(accountDeletionRequests.leaseExpiresAt),
        lt(accountDeletionRequests.leaseExpiresAt, now),
      ),
    ))
    .returning();

  return claimed ?? null;
}

async function clearChildActivityRedis(childIds: string[]) {
  const redis = getRedisClient();
  if (!redis || childIds.length === 0) {
    return;
  }
  if (redis.status === "wait") {
    await redis.connect();
  }

  for (const childId of childIds) {
    let cursor = "0";
    do {
      const [nextCursor, keys] = await redis.scan(
        cursor,
        "MATCH",
        `activity:${childId}:*`,
        "COUNT",
        200,
      );
      cursor = nextCursor;
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    } while (cursor !== "0");
  }
}

async function collectPurgeContext(request: DeletionRequest) {
  if (!request.userId) {
    return null;
  }

  const [user] = await db.select().from(users).where(eq(users.id, request.userId)).limit(1);
  if (!user) {
    return null;
  }

  const childRows = request.scope === "family" && request.organizationId
    ? await db.select({ id: children.id, avatarUrl: children.avatarUrl })
      .from(children)
      .where(eq(children.organizationId, request.organizationId))
    : [];
  const deviceRows = request.scope === "family" && childRows.length > 0
    ? await db.select({ id: childDeviceBindings.deviceId })
      .from(childDeviceBindings)
      .where(inArray(childDeviceBindings.childId, childRows.map((child) => child.id)))
    : [];

  return {
    childRows,
    deviceIds: [...new Set(deviceRows.map((row) => row.id))],
    user,
  };
}

async function deleteExternalData(request: DeletionRequest, context: NonNullable<Awaited<ReturnType<typeof collectPurgeContext>>>) {
  const keys = await listStoredAvatarPaths(`users/${context.user.id}/`);

  if (request.scope === "family" && request.organizationId) {
    keys.push(...await listStoredAvatarPaths(`${request.organizationId}/`));
    for (const child of context.childRows) {
      if (isStoredAvatarPath(child.avatarUrl)) {
        keys.push(child.avatarUrl!);
      }
    }
    await clearChildActivityRedis(context.childRows.map((child) => child.id));
  } else if (request.organizationId) {
    const requesterPrefix = `${request.organizationId}/${context.user.id}/`;
    const requesterKeys = await listStoredAvatarPaths(requesterPrefix);
    const referencedRows = await db.select({ avatarUrl: children.avatarUrl })
      .from(children)
      .where(eq(children.organizationId, request.organizationId));
    const preserved = new Set(
      referencedRows
        .map((row) => row.avatarUrl)
        .filter((value): value is string => Boolean(value && isStoredAvatarPath(value))),
    );
    keys.push(...requesterKeys.filter((key) => !preserved.has(key)));
  }

  if (isStoredAvatarPath(context.user.image)) {
    keys.push(context.user.image!);
  }
  await deleteStoredAvatarPaths(keys);
}

async function permanentlyDelete(request: DeletionRequest) {
  const context = await collectPurgeContext(request);
  if (!context) {
    await db.update(accountDeletionRequests).set({
      adminTransferredToUserId: null,
      status: "completed",
      completedAt: new Date(),
      leaseExpiresAt: null,
      lastError: null,
      organizationId: null,
      userId: null,
      updatedAt: new Date(),
    }).where(eq(accountDeletionRequests.id, request.id));
    return;
  }

  await deleteExternalData(request, context);

  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${request.id}))`);
    const [current] = await tx.select().from(accountDeletionRequests)
      .where(eq(accountDeletionRequests.id, request.id)).limit(1);
    if (!current || current.status === "completed" || current.status === "cancelled") {
      return;
    }

    if (request.scope === "family" && request.organizationId) {
      await tx.delete(organizations).where(eq(organizations.id, request.organizationId));
      if (context.deviceIds.length > 0) {
        await tx.update(devices).set({
          authTokenHash: null,
          lastSeenAt: null,
          reservationTokenHash: null,
          reservedByOrganizationId: null,
          reservedByUserId: null,
          reservedUntil: null,
          status: sql`CASE WHEN ${devices.status} = 'blocked' THEN 'blocked'::device_status ELSE 'fresh'::device_status END`,
          updatedAt: new Date(),
        }).where(inArray(devices.id, context.deviceIds));
      }
    }

    await tx.delete(phoneAuthChallenges).where(eq(phoneAuthChallenges.phoneNumber, context.user.phoneNumber));
    await tx.delete(verifications).where(or(
      eq(verifications.identifier, context.user.phoneNumber),
      eq(verifications.identifier, context.user.email),
    ));
    await tx.delete(previewAccessEntries).where(eq(previewAccessEntries.phoneNumber, context.user.phoneNumber));
    await tx.delete(feedbackSubmissions).where(or(
      eq(feedbackSubmissions.phoneNumber, context.user.phoneNumber),
      eq(feedbackSubmissions.email, context.user.email),
    ));
    await tx.delete(users).where(eq(users.id, context.user.id));
    await tx.update(accountDeletionRequests).set({
      adminTransferredToUserId: null,
      status: "completed",
      completedAt: new Date(),
      leaseExpiresAt: null,
      lastError: null,
      organizationId: null,
      userId: null,
      updatedAt: new Date(),
    }).where(eq(accountDeletionRequests.id, request.id));
  });
}

async function recordFailure(request: DeletionRequest, error: unknown) {
  const attemptCount = request.attemptCount + 1;
  await db.update(accountDeletionRequests).set({
    status: "purging",
    attemptCount,
    lastError: safeErrorMessage(error),
    leaseExpiresAt: null,
    nextAttemptAt: nextRetryAt(attemptCount),
    updatedAt: new Date(),
  }).where(eq(accountDeletionRequests.id, request.id));

  console.error("[account-deletion] purge failed", {
    attemptCount,
    overdue: request.purgeBy <= new Date(),
    requestId: request.id,
  });
}

export async function processDueAccountDeletions(limit = BATCH_SIZE) {
  for (let index = 0; index < limit; index += 1) {
    const request = await claimNextRequest();
    if (!request) {
      return;
    }
    try {
      await permanentlyDelete(request);
      console.info("[account-deletion] purge completed", {
        requestId: request.id,
        scope: request.scope,
      });
    } catch (error) {
      await recordFailure(request, error);
    }
  }
}
