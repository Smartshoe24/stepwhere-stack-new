import { randomUUID } from "node:crypto";
import { and, eq, gt, isNull, lte, sql } from "drizzle-orm";
import type {
  ActiveShareLinkResponseDto,
  CreateShareLinkInput,
  PublicShareResponseDto,
  RevokedShareLinkDto,
  ShareLinkDto,
} from "@stepwhere/types";

import { env } from "../../config/env";
import { db } from "../../db/client";
import { requireChildCoverage, snapshotLocationHasCoverage } from "../billing/billing-coverage.service";
import { childDeviceBindings, childShareLinks, childStatusSnapshots, children, devices } from "../../db/schema";
import { createSignedToken, sha256 } from "../../shared/crypto";
import { conflict, gone, notFound } from "../../shared/errors";
import { detachBackgroundTask } from "../../shared/background-task";
import { toChildSummaryDto } from "../children/children.mapper";
import { getChildForOrganization } from "../children/children.service";
import { expireShareLinkIfNeeded } from "./share-revocation";
import { toPublicShareChildDto, toPublicShareResponseDto, toShareLinkDto } from "./shares.mapper";

const SHARE_DURATION_MS = {
  15: 15 * 60 * 1000,
  60: 60 * 60 * 1000,
  240: 4 * 60 * 60 * 1000,
} satisfies Record<CreateShareLinkInput["durationMinutes"], number>;

type ShareLookupRow = {
  child: typeof children.$inferSelect;
  device: typeof devices.$inferSelect | null;
  share: typeof childShareLinks.$inferSelect;
  snapshot: typeof childStatusSnapshots.$inferSelect | null;
};


function getShareUrl(rawToken: string) {
  return `${env.PUBLIC_SHARE_APP_URL.replace(/\/+$/, "")}/s/${rawToken}`;
}

function getRawShareToken(shareId: string) {
  return createSignedToken("v1", shareId, env.SHARE_LINK_SIGNING_SECRET);
}

function toActiveShareLinkDto(share: typeof childShareLinks.$inferSelect) {
  return toShareLinkDto({
    id: share.id,
    shareUrl: getShareUrl(getRawShareToken(share.id)),
    startsAt: share.startsAt,
    expiresAt: share.expiresAt,
  });
}

function assertShareAvailability(share: typeof childShareLinks.$inferSelect, now: Date) {
  if (share.status === "revoked") {
    throw gone("SHARE_LINK_UNAVAILABLE", "This location link is unavailable.");
  }

  if (share.status === "expired") {
    throw gone("SHARE_LINK_EXPIRED", "This location link has expired.");
  }

  if (share.expiresAt.getTime() <= now.getTime()) {
    detachBackgroundTask(
      "expired-share-status-update",
      () => expireShareLinkIfNeeded(share.id),
      { preventOverlap: false },
    );
    throw gone("SHARE_LINK_EXPIRED", "This location link has expired.");
  }
}

/**
 * Build the public child payload through the same mapper the telemetry
 * broadcast uses (`toChildSummaryDto` -> `toPublicShareChildDto`), so a poll
 * and a socket push can never disagree on gpsState, labels or position.
 */
async function mapPublicShareChild(row: ShareLookupRow) {
  return toPublicShareChildDto(await toChildSummaryDto({
    child: row.child,
    snapshot: row.snapshot,
    device: row.device,
    activePlan: null,
  }));
}

export async function createShareLink(input: {
  childId: string;
  create: CreateShareLinkInput;
  organizationId: string;
  userId: string;
}): Promise<{ replacedShareIds: string[]; share: ShareLinkDto }> {
  const child = await getChildForOrganization(input.organizationId, input.childId);

  if (child.lifecycleStatus !== "active") {
    throw conflict("Live location can't be shared for an archived child.");
  }
  await requireChildCoverage(input.organizationId, input.childId);

  const shareId = randomUUID();
  const rawToken = getRawShareToken(shareId);
  const tokenHash = sha256(rawToken);
  const startsAt = new Date();
  const expiresAt = new Date(startsAt.getTime() + SHARE_DURATION_MS[input.create.durationMinutes]);

  const replacedShareIds = await db.transaction(async (tx) => {
    await tx.execute(sql`select id from children where id = ${input.childId} for update`);

    await tx
      .update(childShareLinks)
      .set({
        status: "expired",
        updatedAt: startsAt,
      })
      .where(and(
        eq(childShareLinks.childId, input.childId),
        eq(childShareLinks.status, "active"),
        lte(childShareLinks.expiresAt, startsAt),
      ));

    const replaced = await tx
      .update(childShareLinks)
      .set({
        status: "revoked",
        revokedAt: startsAt,
        updatedAt: startsAt,
      })
      .where(and(
        eq(childShareLinks.childId, input.childId),
        eq(childShareLinks.status, "active"),
      ))
      .returning({ id: childShareLinks.id });

    await tx.insert(childShareLinks).values({
      id: shareId,
      childId: input.childId,
      tokenHash,
      startsAt,
      expiresAt,
      status: "active",
      createdByUserId: input.userId,
    });

    return replaced.map((share) => share.id);
  });

  return {
    replacedShareIds,
    share: toShareLinkDto({
      id: shareId,
      shareUrl: getShareUrl(rawToken),
      startsAt,
      expiresAt,
    }),
  };
}

export async function getActiveShareLink(input: {
  childId: string;
  organizationId: string;
}): Promise<ActiveShareLinkResponseDto> {
  await getChildForOrganization(input.organizationId, input.childId);
  const now = new Date();

  await db
    .update(childShareLinks)
    .set({ status: "expired", updatedAt: now })
    .where(and(
      eq(childShareLinks.childId, input.childId),
      eq(childShareLinks.status, "active"),
      lte(childShareLinks.expiresAt, now),
    ));

  const [share] = await db
    .select()
    .from(childShareLinks)
    .where(and(
      eq(childShareLinks.childId, input.childId),
      eq(childShareLinks.status, "active"),
      gt(childShareLinks.expiresAt, now),
    ))
    .limit(1);

  return { share: share ? toActiveShareLinkDto(share) : null };
}

export async function revokeShareLink(input: {
  childId: string;
  organizationId: string;
  shareId: string;
}): Promise<{ didRevoke: boolean; share: RevokedShareLinkDto }> {
  await getChildForOrganization(input.organizationId, input.childId);
  const now = new Date();

  const [revoked] = await db
    .update(childShareLinks)
    .set({
      status: "revoked",
      revokedAt: now,
      updatedAt: now,
    })
    .where(and(
      eq(childShareLinks.id, input.shareId),
      eq(childShareLinks.childId, input.childId),
      eq(childShareLinks.status, "active"),
      gt(childShareLinks.expiresAt, now),
    ))
    .returning();

  if (revoked) {
    return {
      didRevoke: true,
      share: { id: revoked.id, revokedAt: now.toISOString(), status: "revoked" },
    };
  }

  const [existing] = await db
    .select()
    .from(childShareLinks)
    .where(and(
      eq(childShareLinks.id, input.shareId),
      eq(childShareLinks.childId, input.childId),
    ))
    .limit(1);

  if (!existing) {
    throw notFound("SHARE_LINK_NOT_FOUND", "This location link is unavailable.");
  }

  if (existing.status === "revoked") {
    return {
      didRevoke: false,
      share: {
        id: existing.id,
        revokedAt: (existing.revokedAt ?? existing.updatedAt).toISOString(),
        status: "revoked",
      },
    };
  }

  // Either already marked expired, or still "active" in the DB but past its
  // expiry time. Both ended on their own; report that instead of a fake revoke.
  if (existing.status === "active") {
    await expireShareLinkIfNeeded(existing.id);
  }

  return {
    didRevoke: false,
    share: {
      id: existing.id,
      revokedAt: null,
      status: "expired",
    },
  };
}

export async function getShareLookupByRawToken(rawToken: string, now = new Date()) {
  const tokenHash = sha256(rawToken);
  const [row] = await db
    .select({
      share: childShareLinks,
      child: children,
      snapshot: childStatusSnapshots,
      device: devices,
    })
    .from(childShareLinks)
    .innerJoin(children, eq(children.id, childShareLinks.childId))
    .leftJoin(childStatusSnapshots, eq(childStatusSnapshots.childId, children.id))
    .leftJoin(
      childDeviceBindings,
      and(eq(childDeviceBindings.childId, children.id), isNull(childDeviceBindings.unboundAt)),
    )
    .leftJoin(devices, eq(devices.id, childDeviceBindings.deviceId))
    .where(eq(childShareLinks.tokenHash, tokenHash))
    .limit(1);

  if (!row) {
    throw notFound("SHARE_LINK_NOT_FOUND", "This location link is unavailable.");
  }

  assertShareAvailability(row.share, now);

  // Links created before archive started revoking them can still be "active".
  if (row.child.status !== "active") {
    throw gone("SHARE_LINK_UNAVAILABLE", "This location link is unavailable.");
  }
  await requireChildCoverage(row.child.organizationId, row.child.id);
  if (row.snapshot?.lastLocationAt && !await snapshotLocationHasCoverage(row.child.organizationId, row.snapshot.lastLocationEventId)) {
    row.snapshot = { ...row.snapshot, lastLatitude: null, lastLongitude: null, lastLocationLabel: null, lastLocationSource: null, lastLocationAccuracyMeters: null, lastLocationAt: null };
  }
  return row satisfies ShareLookupRow;
}

export async function getPublicShareResponseByRawToken(rawToken: string, now = new Date()): Promise<PublicShareResponseDto> {
  const row = await getShareLookupByRawToken(rawToken, now);
  const child = await mapPublicShareChild(row);

  return toPublicShareResponseDto({
    child,
    startsAt: row.share.startsAt,
    expiresAt: row.share.expiresAt,
  });
}

/** One lookup for the socket upgrade: registry context plus the initial snapshot. */
export async function getPublicShareSocketContext(rawToken: string, now = new Date()) {
  const row = await getShareLookupByRawToken(rawToken, now);
  const child = await mapPublicShareChild(row);

  return {
    shareId: row.share.id,
    childId: row.child.id,
    expiresAt: row.share.expiresAt,
    snapshot: toPublicShareResponseDto({
      child,
      startsAt: row.share.startsAt,
      expiresAt: row.share.expiresAt,
    }),
  };
}

export { toPublicShareChildDto };
