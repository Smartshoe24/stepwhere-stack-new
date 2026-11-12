import { and, eq, gt, isNull, lte, sql, type SQL, type AnyColumn } from "drizzle-orm";
import { env } from "../../config/env";
import { db } from "../../db/client";
import { childDeviceBindings, children, deviceCoverageIntervals, locationEvents } from "../../db/schema";
import { AppError } from "../../shared/errors";
import type { BillingTransaction } from "./billing-ownership.service";

export function billingEnforced(organizationId: string) {
  return env.BILLING_ENFORCEMENT_ENABLED || (env.BILLING_PILOT_ORGANIZATION_IDS ?? []).includes(organizationId);
}

export async function deviceHasCoverage(organizationId: string, deviceId: string | null, at = new Date(), executor: typeof db | BillingTransaction = db) {
  if (!billingEnforced(organizationId)) return true;
  if (!deviceId) return false;
  const [grant] = await executor.select({ id: deviceCoverageIntervals.id }).from(deviceCoverageIntervals).where(and(
    eq(deviceCoverageIntervals.organizationId, organizationId), eq(deviceCoverageIntervals.deviceId, deviceId),
    lte(deviceCoverageIntervals.startsAt, at), gt(deviceCoverageIntervals.endsAt, at), isNull(deviceCoverageIntervals.revokedAt),
  )).limit(1);
  return Boolean(grant);
}

export async function childHasCoverage(organizationId: string, childId: string, at = new Date()) {
  if (!billingEnforced(organizationId)) return true;
  const [binding] = await db.select({ deviceId: childDeviceBindings.deviceId }).from(childDeviceBindings).innerJoin(children, eq(children.id, childDeviceBindings.childId)).where(and(eq(children.organizationId, organizationId), eq(childDeviceBindings.childId, childId), isNull(childDeviceBindings.unboundAt))).limit(1);
  return deviceHasCoverage(organizationId, binding?.deviceId ?? null, at);
}

export async function requireChildCoverage(organizationId: string, childId: string) {
  if (!await childHasCoverage(organizationId, childId)) throw new AppError(403, "SUBSCRIPTION_REQUIRED", "This shoe needs an active subscription.");
}

export async function snapshotLocationHasCoverage(organizationId: string, locationEventId: string | null) {
  if (!billingEnforced(organizationId)) return true;
  if (!locationEventId) return false;
  const [event] = await db.select({ id: locationEvents.id }).from(locationEvents).where(and(eq(locationEvents.id, locationEventId), coveragePredicate(organizationId, locationEvents.deviceId, locationEvents.occurredAt))).limit(1);
  return Boolean(event);
}

// Merge adjacent paid/trial/grace grants; require continuous coverage across the
// whole aggregate/path. Never bridge unpaid gaps.
export function coveragePredicate(organizationId: string, deviceId: AnyColumn | SQL, startsAt: AnyColumn | SQL, endsAt: AnyColumn | SQL = startsAt): SQL {
  if (!billingEnforced(organizationId)) return sql`true`;
  return sql`coalesce((select range_agg(tstzrange(billing_coverage.starts_at, billing_coverage.ends_at, '[)'))
    @> tstzrange(${startsAt}, ${endsAt}, '[]') from device_coverage_intervals billing_coverage
    where billing_coverage.organization_id = ${organizationId}::uuid and billing_coverage.device_id = ${deviceId}
      and billing_coverage.revoked_at is null), false)`;
}

export async function currentCoverageWindow(organizationId: string, deviceId: string) {
  if (!billingEnforced(organizationId)) return null;
  const rows = await db.execute<{ starts_at: string; ends_at: string }>(sql`select lower(covered_range) as starts_at, upper(covered_range) as ends_at
    from (select unnest(range_agg(tstzrange(starts_at, ends_at, '[)'))) as covered_range from device_coverage_intervals
      where organization_id = ${organizationId}::uuid and device_id = ${deviceId}::uuid and revoked_at is null) ranges
    where covered_range @> now()`);
  return rows[0] ? { startsAt: new Date(rows[0].starts_at), endsAt: new Date(rows[0].ends_at) } : null;
}
