import { addYears } from "date-fns";

import { deviceCoverageIntervals } from "../../db/schema";
import { claimDevice, DAY_MS, type BillingTransaction } from "../billing/billing-ownership.service";

/** One stable key per shoe, so re-provisioning upserts the same grant row. */
export const PLAY_REVIEW_COVERAGE_GRANT_KEY = "support:play-review";

/**
 * Starts before the oldest seeded history (7 days back) so it is all visible
 * under enforcement, and runs long enough to outlast any store review cycle.
 */
export function playReviewCoverageWindow(now: Date) {
  return {
    startsAt: new Date(now.getTime() - 8 * DAY_MS),
    endsAt: addYears(now, 10),
  };
}

/**
 * Gives the store reviewer family real ownership and real coverage for its demo
 * shoe. The "Included Shoe Service" plan row is only a display label; coverage
 * gates read `device_coverage_intervals`.
 *
 * Idempotent: claimDevice skips an existing claim and activation, and the
 * support grant is upserted on the (device_id, grant_key, source) unique index.
 */
export async function provisionPlayReviewDeviceBilling(tx: BillingTransaction, input: {
  deviceId: string;
  organizationId: string;
  userId: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  await claimDevice(tx, input.deviceId, input.organizationId, input.userId, now);

  const { startsAt, endsAt } = playReviewCoverageWindow(now);
  await tx.insert(deviceCoverageIntervals).values({
    deviceId: input.deviceId,
    organizationId: input.organizationId,
    grantKey: PLAY_REVIEW_COVERAGE_GRANT_KEY,
    source: "support",
    startsAt,
    endsAt,
  }).onConflictDoUpdate({
    target: [deviceCoverageIntervals.deviceId, deviceCoverageIntervals.grantKey, deviceCoverageIntervals.source],
    set: { organizationId: input.organizationId, startsAt, endsAt, revokedAt: null },
  });

  return { startsAt, endsAt };
}
