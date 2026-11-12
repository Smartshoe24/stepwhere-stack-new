import { and, eq, isNull, sql } from "drizzle-orm";
import { env } from "../../config/env";
import { db } from "../../db/client";
import { deviceActivations, deviceCoverageIntervals, deviceOwnerships, devices } from "../../db/schema";
import { AppError } from "../../shared/errors";

export type BillingTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
export const DAY_MS = 86_400_000;
export const GRACE_MS = 3 * DAY_MS;

/**
 * BILLING_DEVICE_OWNERSHIP_ENABLED. When off, binds record no family claim and
 * never raise DEVICE_BOUND_ELSEWHERE; ordinary active-binding checks still apply.
 */
export function deviceOwnershipEnabled() {
  return env.BILLING_DEVICE_OWNERSHIP_ENABLED;
}

export async function assertDeviceOwnership(tx: BillingTransaction, deviceId: string, organizationId: string) {
  // Device row serializes reservations, ownership claims, and warranty operations.
  await tx.execute(sql`select id from devices where id = ${deviceId} for update`);
  if (!deviceOwnershipEnabled()) return;
  const [owner] = await tx.select().from(deviceOwnerships).where(and(eq(deviceOwnerships.deviceId, deviceId), isNull(deviceOwnerships.releasedAt), sql`${deviceOwnerships.organizationId} is not null`));
  if (owner && owner.organizationId !== organizationId) {
    throw new AppError(409, "DEVICE_BOUND_ELSEWHERE", "This shoe belongs to another family. Support must release or transfer it first.");
  }
}

/**
 * The single ownership/trial entry point for every path that binds a shoe to a
 * child (onboarding create/bind, admin bind, admin "create child for user",
 * store-review provisioning). Call it inside the binding transaction.
 */
export async function claimDevice(tx: BillingTransaction, deviceId: string, organizationId: string, userId: string | null, now = new Date()) {
  await assertDeviceOwnership(tx, deviceId, organizationId);
  let firstClaimByFamily: boolean;
  if (deviceOwnershipEnabled()) {
    const [owner] = await tx.select().from(deviceOwnerships).where(and(eq(deviceOwnerships.deviceId, deviceId), eq(deviceOwnerships.organizationId, organizationId), isNull(deviceOwnerships.releasedAt)));
    if (!owner) await tx.insert(deviceOwnerships).values({ deviceId, organizationId, claimedByUserId: userId, claimedAt: now });
    firstClaimByFamily = !owner;
  } else {
    // No claim is recorded. A family's first coverage grant on this shoe stands
    // in for its claim so rebinding does not stack remaining-trial grants.
    const [grant] = await tx.select({ id: deviceCoverageIntervals.id }).from(deviceCoverageIntervals).where(and(eq(deviceCoverageIntervals.deviceId, deviceId), eq(deviceCoverageIntervals.organizationId, organizationId))).limit(1);
    firstClaimByFamily = !grant;
  }
  const [created] = await tx.insert(deviceActivations).values({ deviceId, activatedAt: now, trialEndsAt: new Date(now.getTime() + 30 * DAY_MS) }).onConflictDoNothing().returning();
  if (created) {
    await tx.insert(deviceCoverageIntervals).values([
      { deviceId, organizationId, grantKey: `trial:${deviceId}`, source: "trial", startsAt: now, endsAt: created.trialEndsAt },
      { deviceId, organizationId, grantKey: `trial:${deviceId}`, source: "grace", startsAt: created.trialEndsAt, endsAt: new Date(created.trialEndsAt.getTime() + GRACE_MS) },
    ]);
  } else if (firstClaimByFamily) {
    // A legitimate support release/reclaim carries remaining physical-device trial,
    // not a new free month. Paid ownership transfers require support grants.
    const [activation] = await tx.select().from(deviceActivations).where(eq(deviceActivations.deviceId, deviceId));
    if (!activation.trialConvertedAt && activation.trialEndsAt.getTime() + GRACE_MS > now.getTime()) {
      await tx.insert(deviceCoverageIntervals).values({ deviceId, organizationId, grantKey: `reclaim:${organizationId}:${now.getTime()}`, source: "trial", startsAt: now, endsAt: new Date(activation.trialEndsAt.getTime() + GRACE_MS) });
    }
  }
  await tx.update(devices).set({ updatedAt: now }).where(eq(devices.id, deviceId));
}
