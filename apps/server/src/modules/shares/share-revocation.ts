import { and, eq, inArray, sql } from "drizzle-orm";

import { db } from "../../db/client";
import { childShareLinks } from "../../db/schema";

// DB-only share lifecycle helpers. Kept apart from shares.service so modules
// that shares.service depends on (children, family, account deletion) can
// revoke links without an import cycle.

type DbExecutor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function expireShareLinkIfNeeded(shareId: string) {
  await db
    .update(childShareLinks)
    .set({
      status: "expired",
      updatedAt: new Date(),
    })
    .where(and(eq(childShareLinks.id, shareId), eq(childShareLinks.status, "active")));
}

/**
 * Revoke every active link for the given children. Returns the revoked IDs so
 * the caller can close open viewer sockets once its transaction commits.
 */
export async function revokeActiveShareLinksForChildren(
  executor: DbExecutor,
  childIds: readonly string[],
  now = new Date(),
): Promise<string[]> {
  if (childIds.length === 0) {
    return [];
  }

  const revoked = await executor
    .update(childShareLinks)
    .set({
      status: "revoked",
      revokedAt: now,
      updatedAt: now,
    })
    .where(and(
      inArray(childShareLinks.childId, [...childIds]),
      eq(childShareLinks.status, "active"),
    ))
    .returning({ id: childShareLinks.id });

  return revoked.map((share) => share.id);
}

/** Same as above for every child in a family, archived ones included. */
export async function revokeActiveShareLinksForOrganization(
  executor: DbExecutor,
  organizationId: string,
  now = new Date(),
): Promise<string[]> {
  const revoked = await executor
    .update(childShareLinks)
    .set({
      status: "revoked",
      revokedAt: now,
      updatedAt: now,
    })
    .where(and(
      eq(childShareLinks.status, "active"),
      sql`${childShareLinks.childId} IN (SELECT id FROM children WHERE organization_id = ${organizationId})`,
    ))
    .returning({ id: childShareLinks.id });

  return revoked.map((share) => share.id);
}
