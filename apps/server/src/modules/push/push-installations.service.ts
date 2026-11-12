import { and, eq, inArray, or, sql } from "drizzle-orm";
import type { RegisterPushInstallationInput } from "@stepwhere/types";

import { db } from "../../db/client";
import { pushInstallations } from "../../db/schema";

export async function registerPushInstallation(input: {
  sessionId: string | null;
  userId: string;
  values: RegisterPushInstallationInput;
}) {
  const now = new Date();

  return db.transaction(async (tx) => {
    const lockKeys = [
      `push-installation:${input.values.installationId}`,
      `push-token:${input.values.expoPushToken}`,
    ].sort();

    for (const lockKey of lockKeys) {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${lockKey}))`);
    }

    const matchingRows = await tx
      .select({
        id: pushInstallations.id,
        installationId: pushInstallations.installationId,
        userId: pushInstallations.userId,
      })
      .from(pushInstallations)
      .where(or(
        eq(pushInstallations.installationId, input.values.installationId),
        eq(pushInstallations.expoPushToken, input.values.expoPushToken),
      ));
    const staleIds = matchingRows
      .filter((row) => !(
        row.userId === input.userId
        && row.installationId === input.values.installationId
      ))
      .map((row) => row.id);

    if (staleIds.length > 0) {
      await tx.delete(pushInstallations).where(inArray(pushInstallations.id, staleIds));
    }

    const [saved] = await tx
      .insert(pushInstallations)
      .values({
        userId: input.userId,
        sessionId: input.sessionId,
        installationId: input.values.installationId,
        expoPushToken: input.values.expoPushToken,
        platform: input.values.platform,
        appVersion: input.values.appVersion,
        status: "active",
        lastFailureAt: null,
        failureReason: null,
        lastRegisteredAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [pushInstallations.userId, pushInstallations.installationId],
        set: {
          sessionId: input.sessionId,
          expoPushToken: input.values.expoPushToken,
          platform: input.values.platform,
          appVersion: input.values.appVersion,
          status: "active",
          lastFailureAt: null,
          failureReason: null,
          lastRegisteredAt: now,
          updatedAt: now,
        },
      })
      .returning();

    return saved;
  });
}

export async function deletePushInstallation(input: {
  installationId: string;
  userId: string;
}) {
  const [deleted] = await db
    .delete(pushInstallations)
    .where(and(
      eq(pushInstallations.userId, input.userId),
      eq(pushInstallations.installationId, input.installationId),
    ))
    .returning({
      id: pushInstallations.id,
    });

  return Boolean(deleted);
}
