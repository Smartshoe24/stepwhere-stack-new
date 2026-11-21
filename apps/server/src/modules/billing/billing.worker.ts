import { and, eq, gt, inArray, isNotNull, isNull, lt, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db/client";
import { billingAudit, billingCharges, billingCheckoutIntents, billingMandates, billingProviderEvents, children, childShareLinks, deviceOwnerships, familySubscriptions } from "../../db/schema";
import { AppError } from "../../shared/errors";
import { childHasCoverage } from "./billing-coverage.service";
import { applyChargeSnapshot, handBackFreeMonths, hasPaid, notifySafely, refreshCharge, refreshMandate, refreshRefund, runAfterCommit, stopRenewing, type AfterCommit } from "./billing-ledger.service";
import { billingCopy, notifyFamily } from "./billing-notifications.service";
import { addDays, addMonths, earliestDueOn, istDate, laterDate } from "./billing-pricing";
import { lockBilling, perShoePrice } from "./billing.service";
import { expireCheckout } from "./billing-checkout.service";
import { billingProvider, ProviderError } from "./providers";
import { publicShareRealtimeRegistry } from "../shares/share-realtime.service";

/** Charges are sent to the bank this many days before they're due, so the pre-debit notice goes out in time. */
const SUBMIT_DAYS_AHEAD = 3;
/** Renewal charges are created this long before a period ends. */
const RENEWAL_LEAD_MS = 5 * 86_400_000;

const eventSchema = z.object({ provider: z.enum(["cashfree", "fake"]), kind: z.enum(["mandate", "charge", "payment", "refund"]), ref: z.string().uuid() });

export async function processBillingEvents(limit = 20) {
  for (let index = 0; index < limit; index++) {
    const event = await db.transaction(async (tx) => {
      const [row] = await tx.select().from(billingProviderEvents).where(and(lte(billingProviderEvents.availableAt, new Date()), or(eq(billingProviderEvents.state, "pending"), and(eq(billingProviderEvents.state, "processing"), lte(billingProviderEvents.leaseUntil, new Date()))))).orderBy(billingProviderEvents.receivedAt).limit(1).for("update", { skipLocked: true });
      if (!row) return null;
      await tx.update(billingProviderEvents).set({ state: "processing", attempts: row.attempts + 1, leaseUntil: new Date(Date.now() + 120_000) }).where(eq(billingProviderEvents.id, row.id));
      return row;
    });
    if (!event) break;
    try {
      const parsed = eventSchema.safeParse(event.payload);
      if (!parsed.success) throw new AppError(409, "BILLING_CONFLICT", "Unsupported billing event.");
      const { kind, ref } = parsed.data;
      if (kind === "mandate") await refreshMandate(ref);
      else if (kind === "refund") await refreshRefund(ref);
      else await refreshCharge(ref);
      await db.update(billingProviderEvents).set({ state: "completed", leaseUntil: null, lastError: null }).where(eq(billingProviderEvents.id, event.id));
    } catch (error) {
      const review = (error instanceof AppError && error.status === 409) || (error instanceof ProviderError && !error.retryable && error.reason !== "not_found") || event.attempts >= 9;
      await db.update(billingProviderEvents).set({ state: review ? "needs_review" : "pending", leaseUntil: null, availableAt: new Date(Date.now() + Math.min(3_600_000, 30_000 * 2 ** event.attempts)), lastError: error instanceof AppError ? error.code : error instanceof ProviderError ? error.reason : "provider_refresh_failed" }).where(eq(billingProviderEvents.id, event.id));
    }
  }
}

/** Builds next period's charge a few days before the current one ends. */
export async function createRenewalCharges(limit = 50) {
  const due = await db.select().from(familySubscriptions).where(and(eq(familySubscriptions.state, "active"), eq(familySubscriptions.cancelAtPeriodEnd, false), lte(familySubscriptions.periodEndsAt, new Date(Date.now() + RENEWAL_LEAD_MS)))).limit(limit);
  for (const candidate of due) {
    await db.transaction(async (tx) => {
      await lockBilling(tx, candidate.customerId);
      if (candidate.organizationId) await lockBilling(tx, candidate.organizationId);
      const [subscription] = await tx.select().from(familySubscriptions).where(eq(familySubscriptions.id, candidate.id));
      if (subscription.state !== "active" || subscription.cancelAtPeriodEnd) return;
      const [existing] = await tx.select({ id: billingCharges.id }).from(billingCharges).where(and(eq(billingCharges.subscriptionId, subscription.id), eq(billingCharges.kind, "renewal"), eq(billingCharges.periodStartsAt, subscription.periodEndsAt), sql`${billingCharges.status} <> 'cancelled'`));
      if (existing) return;
      // Shoes released from the family since the change was scheduled are dropped.
      const wanted = subscription.nextDeviceIds ?? subscription.deviceIds;
      const owned = subscription.organizationId ? (await tx.select({ deviceId: deviceOwnerships.deviceId }).from(deviceOwnerships).where(and(eq(deviceOwnerships.organizationId, subscription.organizationId), isNull(deviceOwnerships.releasedAt), inArray(deviceOwnerships.deviceId, wanted)))).map((row) => row.deviceId) : [];
      const deviceIds = wanted.filter((id) => owned.includes(id)).sort();
      if (!deviceIds.length) {
        // No follow-ups: nothing for this period has been sent to the bank yet.
        await stopRenewing(tx, subscription, new Date(), "no_shoes_left");
        return;
      }
      const termMonths = subscription.nextTermMonths ?? subscription.termMonths;
      const perShoeMinor = termMonths === subscription.termMonths ? subscription.perShoeMinor : await perShoePrice(tx, subscription.priceBookVersion, termMonths);
      const startsAt = subscription.periodEndsAt;
      const endsAt = addMonths(startsAt, termMonths);
      const amountMinor = perShoeMinor * deviceIds.length;
      await tx.insert(billingCharges).values({
        subscriptionId: subscription.id, mandateId: subscription.mandateId, organizationId: subscription.organizationId, customerId: subscription.customerId, provider: subscription.provider,
        kind: "renewal", dueOn: istDate(startsAt), periodStartsAt: startsAt, amountMinor, baseMinor: amountMinor,
        breakdown: { perShoeMinor, termMonths, deviceIds, credits: [], coverage: deviceIds.map((deviceId) => ({ deviceId, startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() })), periodStartsAt: startsAt.toISOString(), periodEndsAt: endsAt.toISOString() },
      }).onConflictDoNothing();
    });
  }
}

/**
 * Claims a charge for sending under the purchaser and family locks, so two
 * workers, a plan change and a pay-now can never send the same money twice.
 * A failed charge whose plan has a new autopay is moved onto it instead.
 */
async function claim(chargeId: string, retry: boolean) {
  return db.transaction(async (tx) => {
    const [initial] = await tx.select().from(billingCharges).where(eq(billingCharges.id, chargeId));
    if (!initial) return null;
    await lockBilling(tx, initial.customerId);
    if (initial.organizationId) await lockBilling(tx, initial.organizationId);
    const [charge] = await tx.select().from(billingCharges).where(eq(billingCharges.id, chargeId));
    const [subscription] = await tx.select().from(familySubscriptions).where(eq(familySubscriptions.id, charge.subscriptionId));
    if (!subscription || !["scheduled", "active", "past_due"].includes(subscription.state)) return null;
    const now = new Date();
    if (retry) {
      if (charge.status !== "failed" || !charge.nextAttemptOn || subscription.cancelAtPeriodEnd) return null;
      if (charge.mandateId !== subscription.mandateId) {
        await tx.update(billingCharges).set({ status: "cancelled", failureReason: "moved_to_new_autopay", nextAttemptOn: null, updatedAt: now }).where(eq(billingCharges.id, charge.id));
        const { id: _id, createdAt: _createdAt, ...rest } = charge;
        await tx.insert(billingCharges).values({ ...rest, mandateId: subscription.mandateId, status: "scheduled", dueOn: laterDate(charge.nextAttemptOn, earliestDueOn(now)), attempts: 0, nextAttemptOn: null, providerPaymentId: null, submittedAt: null, failedAt: null, failureReason: null, lastCheckedAt: null, updatedAt: now });
        return null;
      }
    } else if (charge.status !== "scheduled") return null;
    const [mandate] = charge.mandateId ? await tx.select().from(billingMandates).where(eq(billingMandates.id, charge.mandateId)) : [];
    if (!mandate || mandate.status !== "active") return null;
    const [claimed] = await tx.update(billingCharges).set({ status: "submitting", updatedAt: now }).where(and(eq(billingCharges.id, charge.id), eq(billingCharges.status, charge.status))).returning();
    return claimed ? { charge: claimed, mandate, previousStatus: charge.status as "scheduled" | "failed" } : null;
  });
}

async function submit(chargeId: string, retry: boolean) {
  const claimed = await claim(chargeId, retry);
  if (!claimed) return;
  const { charge, mandate, previousStatus } = claimed;
  const now = new Date();
  const dueOn = laterDate(retry ? charge.nextAttemptOn ?? charge.dueOn : charge.dueOn, earliestDueOn(now));
  const provider = billingProvider(charge.provider);
  const markSubmitted = () => db.update(billingCharges).set({ status: "submitted", dueOn, submittedAt: new Date(), attempts: charge.attempts + 1, nextAttemptOn: null, updatedAt: new Date() }).where(and(eq(billingCharges.id, charge.id), eq(billingCharges.status, "submitting")));
  try {
    const input = { mandateRef: mandate.id, providerMandateId: mandate.providerMandateId, chargeRef: charge.id, dueOn };
    const snapshot = retry ? await provider.retryCharge(input) : await provider.scheduleCharge({ ...input, amountMinor: charge.amountMinor, note: "Stepwhere family plan" });
    await markSubmitted();
    if (snapshot.status !== "submitted") await applyChargeSnapshot(charge.id, snapshot);
  } catch (error) {
    if (error instanceof ProviderError && !error.retryable) {
      // The bank won't take this charge at all (autopay inactive or above its limit).
      await markSubmitted();
      await applyChargeSnapshot(charge.id, { ref: charge.id, status: "failed", providerPaymentId: null, paidAt: null, failureReason: error.reason, providerWillRetry: false });
      return;
    }
    // Nothing reached the bank: put it back for the next run.
    await db.update(billingCharges).set({ status: previousStatus, updatedAt: new Date() }).where(and(eq(billingCharges.id, charge.id), eq(billingCharges.status, "submitting")));
    throw error;
  }
}

/** Sends charges to the bank a few days before they're due, and retries failed ones. */
export async function submitDueCharges(limit = 25) {
  const horizon = addDays(istDate(new Date()), SUBMIT_DAYS_AHEAD);
  const scheduled = await db.select({ id: billingCharges.id }).from(billingCharges).innerJoin(familySubscriptions, eq(familySubscriptions.id, billingCharges.subscriptionId))
    .where(and(eq(billingCharges.status, "scheduled"), lte(billingCharges.dueOn, horizon), inArray(familySubscriptions.state, ["scheduled", "active", "past_due"]))).orderBy(billingCharges.dueOn).limit(limit);
  for (const { id } of scheduled) await submit(id, false).catch((error) => console.error("[billing] submit failed", id, error instanceof Error ? error.message : error));

  const retryBy = earliestDueOn(new Date());
  const failed = await db.select({ id: billingCharges.id }).from(billingCharges).innerJoin(familySubscriptions, eq(familySubscriptions.id, billingCharges.subscriptionId))
    .where(and(eq(billingCharges.status, "failed"), isNotNull(billingCharges.nextAttemptOn), lte(billingCharges.nextAttemptOn, retryBy), eq(familySubscriptions.cancelAtPeriodEnd, false), inArray(familySubscriptions.state, ["scheduled", "active", "past_due"]))).limit(limit);
  for (const { id } of failed) await submit(id, true).catch((error) => console.error("[billing] retry failed", id, error instanceof Error ? error.message : error));
}

/**
 * Webhooks are the fast path; this catches any that never arrived, including
 * debits that land after we gave up on a charge. Oldest-checked first, so a
 * pile of abandoned payments can't starve the rest.
 */
export async function reconcileSubmittedCharges(limit = 25) {
  const now = Date.now();
  const today = istDate(new Date());
  const rows = await db.select({ id: billingCharges.id }).from(billingCharges).where(or(
    and(eq(billingCharges.status, "submitted"), or(lte(billingCharges.dueOn, today), eq(billingCharges.kind, "one_time")), or(isNull(billingCharges.lastCheckedAt), lt(billingCharges.lastCheckedAt, new Date(now - 10 * 60_000)))),
    and(inArray(billingCharges.status, ["failed", "cancelled"]), gt(billingCharges.submittedAt, new Date(now - 7 * 86_400_000)), or(isNull(billingCharges.lastCheckedAt), lt(billingCharges.lastCheckedAt, new Date(now - 6 * 3_600_000)))),
  )).orderBy(sql`${billingCharges.lastCheckedAt} asc nulls first`).limit(limit);
  for (const row of rows) await refreshCharge(row.id).catch(() => undefined);

  // A pay-now nobody finished is closed after six hours. A late payment is still recorded.
  await db.update(billingCharges).set({ status: "cancelled", failureReason: "abandoned", updatedAt: new Date() })
    .where(and(eq(billingCharges.kind, "one_time"), eq(billingCharges.status, "submitted"), lt(billingCharges.submittedAt, new Date(now - 6 * 3_600_000))));

  // A worker that died between claiming and sending leaves the charge "submitting".
  const stuck = await db.select().from(billingCharges).where(and(eq(billingCharges.status, "submitting"), lt(billingCharges.updatedAt, new Date(now - 10 * 60_000)))).limit(limit);
  for (const charge of stuck) {
    const [mandate] = charge.mandateId ? await db.select().from(billingMandates).where(eq(billingMandates.id, charge.mandateId)) : [];
    try {
      const snapshot = await billingProvider(charge.provider).getCharge({ mandateRef: charge.mandateId ?? "", providerMandateId: mandate?.providerMandateId ?? null, chargeRef: charge.id });
      await db.update(billingCharges).set({ status: "submitted", submittedAt: new Date(), attempts: charge.attempts + 1, updatedAt: new Date() }).where(and(eq(billingCharges.id, charge.id), eq(billingCharges.status, "submitting")));
      await applyChargeSnapshot(charge.id, snapshot);
    } catch (error) {
      if (error instanceof ProviderError && error.reason === "not_found") {
        await db.update(billingCharges).set({ status: charge.nextAttemptOn ? "failed" : "scheduled", updatedAt: new Date() }).where(and(eq(billingCharges.id, charge.id), eq(billingCharges.status, "submitting")));
      }
    }
  }
}

/** Ends plans whose grace has run out, and drops added shoes whose charge never went through. */
export async function expireBillingState() {
  const now = new Date();
  const ended = await db.select().from(familySubscriptions).where(and(inArray(familySubscriptions.state, ["scheduled", "active", "past_due", "cancelled"]), lte(familySubscriptions.graceEndsAt, now)));
  const followUps: AfterCommit[] = [];
  for (const candidate of ended) {
    const mandateId = await db.transaction(async (tx) => {
      await lockBilling(tx, candidate.customerId);
      if (candidate.organizationId) await lockBilling(tx, candidate.organizationId);
      const [subscription] = await tx.select().from(familySubscriptions).where(eq(familySubscriptions.id, candidate.id));
      if (subscription.graceEndsAt > now || !["scheduled", "active", "past_due", "cancelled"].includes(subscription.state)) return null;
      followUps.push(...await stopRenewing(tx, subscription, now, "plan_expired"));
      await tx.update(familySubscriptions).set({ state: "expired", revision: subscription.revision + 2, updatedAt: now }).where(eq(familySubscriptions.id, subscription.id));
      if (!await hasPaid(tx, subscription.id)) await handBackFreeMonths(tx, subscription);
      const organizationId = subscription.organizationId;
      if (organizationId) await notifySafely(tx, (sp) => notifyFamily(sp, organizationId, { key: `plan_ended:${subscription.id}`, ...billingCopy.planEnded() }));
      await tx.insert(billingAudit).values({ organizationId: subscription.organizationId, action: "plan_expired", details: { subscriptionId: subscription.id } });
      return subscription.mandateId;
    });
    if (mandateId) {
      const [mandate] = await db.select().from(billingMandates).where(eq(billingMandates.id, mandateId));
      if (mandate && mandate.status === "active") {
        await billingProvider(mandate.provider).cancelMandate({ mandateRef: mandate.id, providerMandateId: mandate.providerMandateId }).catch(() => undefined);
        await db.update(billingMandates).set({ status: "cancelled", cancelledAt: now, updatedAt: now }).where(eq(billingMandates.id, mandate.id));
      }
    }
  }

  await runAfterCommit(followUps);

  // An added shoe whose charge failed through all its retries leaves the plan.
  const graceStart = addDays(istDate(now), -3);
  const unpaid = await db.select().from(billingCharges).where(and(eq(billingCharges.kind, "add_shoes"), eq(billingCharges.status, "failed"), isNull(billingCharges.nextAttemptOn), lte(billingCharges.dueOn, graceStart)));
  for (const charge of unpaid) {
    await db.transaction(async (tx) => {
      await lockBilling(tx, charge.customerId);
      if (charge.organizationId) await lockBilling(tx, charge.organizationId);
      const [subscription] = await tx.select().from(familySubscriptions).where(eq(familySubscriptions.id, charge.subscriptionId));
      const dropped = charge.breakdown.deviceIds.filter((id) => subscription?.deviceIds.includes(id));
      await tx.update(billingCharges).set({ status: "cancelled", failureReason: "shoes_removed_unpaid", updatedAt: now }).where(eq(billingCharges.id, charge.id));
      if (!subscription || !dropped.length) return;
      const deviceIds = subscription.deviceIds.filter((id) => !dropped.includes(id));
      if (!deviceIds.length) return;
      await tx.update(familySubscriptions).set({ deviceIds, shoeCount: deviceIds.length, nextDeviceIds: subscription.nextDeviceIds?.filter((id) => !dropped.includes(id)) ?? null, revision: subscription.revision + 1, updatedAt: now }).where(eq(familySubscriptions.id, subscription.id));
      await tx.insert(billingAudit).values({ organizationId: charge.organizationId, action: "unpaid_shoes_removed", details: { subscriptionId: subscription.id, chargeId: charge.id, deviceIds: dropped } });
    });
  }
}

/** Expires abandoned approvals and re-reads autopays in case a webhook was missed. */
export async function reconcileMandates(limit = 25) {
  const now = new Date();
  const stale = await db.select().from(billingCheckoutIntents).where(and(inArray(billingCheckoutIntents.state, ["awaiting_authorization", "bank_pending"]), lt(billingCheckoutIntents.expiresAt, now))).limit(limit);
  for (const intent of stale) {
    await refreshMandate(intent.mandateId).catch(() => undefined);
    const [current] = await db.select().from(billingCheckoutIntents).where(eq(billingCheckoutIntents.id, intent.id));
    if (current.state === "awaiting_authorization") await expireCheckout(current);
    else if (current.state === "bank_pending" && current.expiresAt < now) {
      await db.update(billingCheckoutIntents).set({ state: "expired", failureReason: "expired", updatedAt: now }).where(eq(billingCheckoutIntents.id, current.id));
    }
  }
  const dayAgo = new Date(now.getTime() - 86_400_000);
  const mandates = await db.select({ id: billingMandates.id }).from(billingMandates).where(and(inArray(billingMandates.status, ["active", "bank_pending", "pending_authorization"]), or(isNull(billingMandates.lastSyncedAt), lt(billingMandates.lastSyncedAt, dayAgo)), lt(billingMandates.createdAt, new Date(now.getTime() - 10 * 60_000)))).limit(limit);
  // Our own cancellations, until the provider confirms them.
  const cancelled = await db.select({ id: billingMandates.id }).from(billingMandates).where(and(eq(billingMandates.status, "cancelled"), gt(billingMandates.cancelledAt, new Date(now.getTime() - 30 * 86_400_000)), or(isNull(billingMandates.lastSyncedAt), sql`${billingMandates.lastSyncedAt} < ${billingMandates.cancelledAt}`))).limit(limit);
  for (const mandate of [...mandates, ...cancelled]) await refreshMandate(mandate.id).catch(() => undefined);
}

export async function runBillingCharges() {
  await createRenewalCharges();
  await submitDueCharges();
  await reconcileSubmittedCharges();
}

export async function maintainBillingCoverage() {
  await expireBillingState();
  const shares = await db.select({ share: childShareLinks, organizationId: children.organizationId }).from(childShareLinks).innerJoin(children, eq(children.id, childShareLinks.childId)).where(and(eq(childShareLinks.status, "active"), gt(childShareLinks.expiresAt, new Date())));
  for (const { share, organizationId } of shares) {
    if (await childHasCoverage(organizationId, share.childId)) continue;
    await db.update(childShareLinks).set({ status: "revoked", revokedAt: new Date(), updatedAt: new Date() }).where(eq(childShareLinks.id, share.id));
    await publicShareRealtimeRegistry.endShare(share.id, "stopped");
  }
  // Provider events are delivery records, not the financial ledger.
  await db.delete(billingProviderEvents).where(and(eq(billingProviderEvents.state, "completed"), lte(billingProviderEvents.receivedAt, new Date(Date.now() - 30 * 86_400_000))));
}
