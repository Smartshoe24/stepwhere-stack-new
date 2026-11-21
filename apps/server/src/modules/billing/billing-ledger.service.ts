// Applies what the payment provider reports (autopay approvals, debits,
// refunds) to plans, charges, coverage and invoices. Every function re-reads
// our rows under the purchaser and family locks and is safe to run twice.
import { and, eq, inArray, isNull, like, sql } from "drizzle-orm";
import { db } from "../../db/client";
import { billingAudit, billingCharges, billingCheckoutIntents, billingCustomers, billingInvoiceSequences, billingInvoices, billingMandates, billingRefunds, deviceActivations, deviceCoverageIntervals, familySubscriptions, users, type BillingChargeBreakdown, type MandateStatus } from "../../db/schema";
import { GRACE_MS, type BillingTransaction } from "./billing-ownership.service";
import { addDays, addMonths, earliestDueOn, financialYear, gstSplit, invoiceNumber, istDate, istMidnight, laterDate } from "./billing-pricing";
import { assertNoOtherFamilyPlan, getLiveSubscription, lockBilling, shoeNames, validateSelection } from "./billing.service";
import { billingProvider, type ChargeSnapshot, type MandateSnapshot, type RefundSnapshot } from "./providers";
import { billingCopy, notifyBilling, notifyFamily, purchaserUserId, type BillingNotice } from "./billing-notifications.service";

type Charge = typeof billingCharges.$inferSelect;
type Subscription = typeof familySubscriptions.$inferSelect;
type Mandate = typeof billingMandates.$inferSelect;
export type AfterCommit = () => Promise<void>;
export const IN_FLIGHT = ["submitting", "submitted"] as const;

/** Retries for a failed card or eNACH debit. UPI autopay retries on its own. */
export const MAX_CHARGE_ATTEMPTS = 3;
const OFF_STATUSES: MandateStatus[] = ["customer_cancelled", "customer_paused", "card_expired", "cancelled", "failed", "expired"];

export async function runAfterCommit(tasks: AfterCommit[]) {
  for (const task of tasks) {
    // A failed follow-up is retried by the daily mandate reconcile; it must not undo the commit.
    await task().catch((error) => console.error("[billing] follow-up failed", error instanceof Error ? error.message : error));
  }
}

/** Notifications never block billing: a failure rolls back only its own savepoint. */
export async function notifySafely(tx: BillingTransaction, send: (tx: BillingTransaction) => Promise<void>) {
  await tx.transaction(send).catch((error) => console.error("[billing] notification failed", error instanceof Error ? error.message : error));
}

async function notifyPurchaser(tx: BillingTransaction, organizationId: string | null, customerId: string, notice: BillingNotice) {
  if (!organizationId) return;
  await notifySafely(tx, async (sp) => {
    const purchaser = await purchaserUserId(sp, customerId);
    if (purchaser?.userId) await notifyBilling(sp, organizationId, [purchaser.userId], notice);
  });
}

async function lockFor(tx: BillingTransaction, customerId: string, organizationId: string | null) {
  await lockBilling(tx, customerId);
  if (organizationId) await lockBilling(tx, organizationId);
}

async function grant(tx: BillingTransaction, values: { deviceId: string; organizationId: string | null; subscriptionId: string; grantKey: string; source: "paid" | "grace" | "provisional"; startsAt: Date; endsAt: Date }) {
  if (values.endsAt <= values.startsAt) return;
  await tx.insert(deviceCoverageIntervals).values(values).onConflictDoUpdate({
    target: [deviceCoverageIntervals.deviceId, deviceCoverageIntervals.grantKey, deviceCoverageIntervals.source],
    set: { startsAt: values.startsAt, endsAt: values.endsAt, revokedAt: null },
  });
}

function cancelMandateLater(mandate: Mandate): AfterCommit {
  return async () => {
    await billingProvider(mandate.provider).cancelMandate({ mandateRef: mandate.id, providerMandateId: mandate.providerMandateId });
    await db.update(billingMandates).set({ status: "cancelled", cancelledAt: new Date(), updatedAt: new Date() }).where(and(eq(billingMandates.id, mandate.id), inArray(billingMandates.status, ["active", "bank_pending", "pending_authorization"])));
  };
}

// ---------------------------------------------------------------- Mandates

export async function refreshMandate(mandateId: string) {
  const [mandate] = await db.select().from(billingMandates).where(eq(billingMandates.id, mandateId));
  if (!mandate) return null;
  const provider = billingProvider(mandate.provider);
  let snapshot = await provider.getMandate({ mandateRef: mandate.id, providerMandateId: mandate.providerMandateId });
  // We cancelled it but the bank still has it live: cancel again. A failure
  // throws before lastSyncedAt moves, so the daily reconcile tries once more.
  if (mandate.status === "cancelled" && ["active", "bank_pending", "pending_authorization"].includes(snapshot.status)) {
    await provider.cancelMandate({ mandateRef: mandate.id, providerMandateId: mandate.providerMandateId });
    snapshot = await provider.getMandate({ mandateRef: mandate.id, providerMandateId: mandate.providerMandateId });
  }
  await applyMandateSnapshot(mandate.id, snapshot);
  return snapshot;
}

export async function applyMandateSnapshot(mandateId: string, snapshot: MandateSnapshot) {
  const after: AfterCommit[] = [];
  await db.transaction(async (tx) => {
    const [initial] = await tx.select().from(billingMandates).where(eq(billingMandates.id, mandateId));
    if (!initial) return;
    await lockFor(tx, initial.customerId, initial.organizationId);
    const [mandate] = await tx.select().from(billingMandates).where(eq(billingMandates.id, mandateId));
    const now = new Date();
    // Our own cancellation is final; a late provider status never revives it.
    const status = mandate.status === "cancelled" ? "cancelled" : snapshot.status;
    await tx.update(billingMandates).set({
      status, method: snapshot.method ?? mandate.method, methodLabel: snapshot.methodLabel ?? mandate.methodLabel,
      providerMandateId: snapshot.providerMandateId ?? mandate.providerMandateId, failureReason: snapshot.failureReason,
      authorizedAt: status === "active" ? mandate.authorizedAt ?? now : mandate.authorizedAt,
      cancelledAt: OFF_STATUSES.includes(status) ? mandate.cancelledAt ?? now : mandate.cancelledAt,
      updatedAt: now, lastSyncedAt: now,
    }).where(eq(billingMandates.id, mandateId));
    const current = { ...mandate, status };

    const intents = await tx.select().from(billingCheckoutIntents).where(and(eq(billingCheckoutIntents.mandateId, mandateId), inArray(billingCheckoutIntents.state, ["awaiting_authorization", "bank_pending"])));
    for (const intent of intents) {
      if (status === "active") await completeCheckout(tx, intent, current, now, after);
      // The bank gets five days from when it first started approving, not from each check.
      else if (status === "bank_pending" && intent.state !== "bank_pending") await tx.update(billingCheckoutIntents).set({ state: "bank_pending", expiresAt: new Date(now.getTime() + 5 * 86_400_000), updatedAt: now }).where(eq(billingCheckoutIntents.id, intent.id));
      else if (status === "failed") await tx.update(billingCheckoutIntents).set({ state: "failed", failureReason: "declined", updatedAt: now }).where(eq(billingCheckoutIntents.id, intent.id));
      else if (status === "expired") await tx.update(billingCheckoutIntents).set({ state: "expired", failureReason: "expired", updatedAt: now }).where(eq(billingCheckoutIntents.id, intent.id));
      else if (OFF_STATUSES.includes(status)) await tx.update(billingCheckoutIntents).set({ state: "abandoned", updatedAt: now }).where(eq(billingCheckoutIntents.id, intent.id));
    }

    const [subscription] = await tx.select().from(familySubscriptions).where(and(eq(familySubscriptions.mandateId, mandateId), inArray(familySubscriptions.state, ["scheduled", "active", "past_due", "cancelled"])));
    if (!subscription) return;
    if (OFF_STATUSES.includes(status)) after.push(...await stopRenewing(tx, subscription, now, `autopay_${status}`));
    else if (status === "active" && mandate.status !== "active" && subscription.cancelAtPeriodEnd) {
      // The customer resumed a paused autopay from their UPI app.
      await tx.update(familySubscriptions).set({ cancelAtPeriodEnd: false, state: await resumedState(tx, subscription, now), revision: subscription.revision + 1, updatedAt: now }).where(eq(familySubscriptions.id, subscription.id));
      await restoreStoppedCharges(tx, subscription, mandateId, now);
    }
  });
  await runAfterCommit(after);
}

/** The state a plan goes back to when autopay is on again: active once anything has been paid. */
export async function resumedState(tx: BillingTransaction, subscription: Subscription, now: Date) {
  if (subscription.state !== "cancelled") return subscription.state;
  const [paid] = await tx.select({ id: billingCharges.id }).from(billingCharges).where(and(eq(billingCharges.subscriptionId, subscription.id), inArray(billingCharges.status, ["paid", "partially_refunded"]))).limit(1);
  return paid || subscription.periodStartsAt <= now ? "active" : "scheduled";
}

/**
 * Autopay is off: nothing more is charged and the plan runs to the end of
 * what's paid. Charges already sent to the bank are cancelled there after
 * commit; one the bank takes anyway is refunded when it's reported.
 */
export async function stopRenewing(tx: BillingTransaction, subscription: Subscription, now: Date, reason: string): Promise<AfterCommit[]> {
  const stopped = await tx.update(billingCharges).set({ status: "cancelled", failureReason: `stopped:${reason}`, nextAttemptOn: null, updatedAt: now })
    .where(and(eq(billingCharges.subscriptionId, subscription.id), inArray(billingCharges.kind, ["first", "renewal", "add_shoes"]), inArray(billingCharges.status, ["scheduled", ...IN_FLIGHT])))
    .returning();
  await tx.update(billingCharges).set({ nextAttemptOn: null, updatedAt: now }).where(and(eq(billingCharges.subscriptionId, subscription.id), eq(billingCharges.status, "failed")));
  const after = stopped.filter((charge) => charge.submittedAt && charge.mandateId).map((charge): AfterCommit => async () => {
    const [mandate] = await db.select().from(billingMandates).where(eq(billingMandates.id, charge.mandateId!));
    if (mandate) await billingProvider(charge.provider).cancelCharge({ mandateRef: mandate.id, providerMandateId: mandate.providerMandateId, chargeRef: charge.id });
  });
  if (!await hasPaid(tx, subscription.id) && subscription.state === "scheduled") {
    // Nothing was ever paid, so the plan simply never starts; free months carry on.
    await tx.update(familySubscriptions).set({ state: "expired", cancelAtPeriodEnd: true, graceEndsAt: now, revision: subscription.revision + 1, updatedAt: now }).where(eq(familySubscriptions.id, subscription.id));
    await tx.update(deviceCoverageIntervals).set({ revokedAt: now }).where(and(eq(deviceCoverageIntervals.subscriptionId, subscription.id), eq(deviceCoverageIntervals.source, "provisional"), isNull(deviceCoverageIntervals.revokedAt)));
    await handBackFreeMonths(tx, subscription);
    return after;
  }
  await tx.update(familySubscriptions).set({
    cancelAtPeriodEnd: true, state: subscription.state === "active" || subscription.state === "scheduled" ? "cancelled" : subscription.state,
    nextDeviceIds: null, nextTermMonths: null, revision: subscription.revision + 1, updatedAt: now,
  }).where(eq(familySubscriptions.id, subscription.id));
  return after;
}

export async function hasPaid(tx: BillingTransaction, subscriptionId: string) {
  const [paid] = await tx.select({ id: billingCharges.id }).from(billingCharges).where(and(eq(billingCharges.subscriptionId, subscriptionId), inArray(billingCharges.kind, ["first", "renewal", "one_time"]), inArray(billingCharges.status, ["paid", "partially_refunded"]))).limit(1);
  return Boolean(paid);
}

/** A plan that never got paid gives its shoes' free months back. */
export async function handBackFreeMonths(tx: BillingTransaction, subscription: Subscription) {
  await tx.update(deviceActivations).set({ trialConvertedAt: null }).where(inArray(deviceActivations.deviceId, subscription.deviceIds));
}

/**
 * Autopay is back on: the first or add-shoes charges that stopping cancelled
 * are raised again, with tracking kept on until they clear. Renewals are
 * rebuilt by the worker.
 */
export async function restoreStoppedCharges(tx: BillingTransaction, subscription: Subscription, mandateId: string, now: Date) {
  const stopped = await tx.update(billingCharges).set({ failureReason: "stopped_restored", updatedAt: now })
    .where(and(eq(billingCharges.subscriptionId, subscription.id), eq(billingCharges.status, "cancelled"), inArray(billingCharges.kind, ["first", "add_shoes"]), like(billingCharges.failureReason, "stopped:%")))
    .returning();
  for (const charge of stopped) {
    if (charge.kind === "add_shoes" && !charge.breakdown.deviceIds.some((id) => subscription.deviceIds.includes(id))) continue;
    const dueOn = laterDate(charge.dueOn, earliestDueOn(now));
    const { id: _id, createdAt: _createdAt, ...rest } = charge;
    const [restored] = await tx.insert(billingCharges).values({ ...rest, mandateId, status: "scheduled", dueOn, attempts: 0, nextAttemptOn: null, providerPaymentId: null, submittedAt: null, failedAt: null, failureReason: null, lastCheckedAt: null, updatedAt: now }).returning();
    const endsAt = new Date(istMidnight(dueOn).getTime() + GRACE_MS);
    for (const item of charge.breakdown.coverage) {
      await grant(tx, { deviceId: item.deviceId, organizationId: charge.organizationId, subscriptionId: subscription.id, grantKey: restored.id, source: "provisional", startsAt: new Date(Math.max(now.getTime(), Date.parse(item.startsAt))), endsAt });
    }
    if (charge.kind === "first") await tx.update(familySubscriptions).set({ graceEndsAt: endsAt, updatedAt: now }).where(eq(familySubscriptions.id, subscription.id));
  }
}

async function completeCheckout(tx: BillingTransaction, intent: typeof billingCheckoutIntents.$inferSelect, mandate: Mandate, now: Date, after: AfterCommit[]) {
  const fail = async (reason: "superseded") => {
    await tx.update(billingCheckoutIntents).set({ state: "failed", failureReason: reason, updatedAt: now }).where(eq(billingCheckoutIntents.id, intent.id));
    after.push(cancelMandateLater(mandate));
  };

  if (intent.kind === "replace_mandate") {
    const [subscription] = intent.subscriptionId ? await tx.select().from(familySubscriptions).where(eq(familySubscriptions.id, intent.subscriptionId)) : [];
    if (!subscription || !["scheduled", "active", "past_due", "cancelled"].includes(subscription.state)) return fail("superseded");
    const [previous] = await tx.select().from(billingMandates).where(eq(billingMandates.id, subscription.mandateId));
    await tx.update(familySubscriptions).set({ mandateId: mandate.id, cancelAtPeriodEnd: false, state: await resumedState(tx, subscription, now), revision: subscription.revision + 1, updatedAt: now }).where(eq(familySubscriptions.id, subscription.id));
    await tx.update(billingCharges).set({ mandateId: mandate.id, updatedAt: now }).where(and(eq(billingCharges.subscriptionId, subscription.id), eq(billingCharges.status, "scheduled")));
    // Failed charges are retried on the new autopay: the worker moves each one
    // across before sending it. Pay-now payments and charges with a pay-now in
    // progress are left alone so nothing is taken twice.
    const failed = await tx.select().from(billingCharges).where(and(eq(billingCharges.subscriptionId, subscription.id), eq(billingCharges.status, "failed"), inArray(billingCharges.kind, ["first", "renewal", "add_shoes"])));
    const openPayNows = await tx.select().from(billingCharges).where(and(eq(billingCharges.subscriptionId, subscription.id), eq(billingCharges.kind, "one_time"), inArray(billingCharges.status, [...IN_FLIGHT])));
    for (const charge of failed) {
      if (openPayNows.some((payment) => payment.breakdown.settlesChargeId === charge.id)) continue;
      await tx.update(billingCharges).set({ nextAttemptOn: earliestDueOn(now), updatedAt: now }).where(eq(billingCharges.id, charge.id));
    }
    if (subscription.cancelAtPeriodEnd) await restoreStoppedCharges(tx, subscription, mandate.id, now);
    await tx.update(billingCheckoutIntents).set({ state: "completed", updatedAt: now }).where(eq(billingCheckoutIntents.id, intent.id));
    await tx.insert(billingAudit).values({ organizationId: subscription.organizationId, action: "autopay_replaced", details: { subscriptionId: subscription.id, mandateId: mandate.id, previousMandateId: previous?.id ?? null } });
    if (previous && previous.id !== mandate.id) after.push(cancelMandateLater(previous));
    return;
  }

  const snapshot = intent.snapshot;
  if (!snapshot || !intent.organizationId) return fail("superseded");
  if (await getLiveSubscription(intent.organizationId, tx)) return fail("superseded");
  try { await assertNoOtherFamilyPlan(tx, intent.customerId, intent.organizationId); } catch { return fail("superseded"); }
  try { await validateSelection(tx, intent.organizationId, snapshot.deviceIds); } catch { return fail("superseded"); }

  // A plan with no free days left starts when the autopay is approved, not when it was quoted.
  const startsAt = snapshot.coverageStartsNow ? now : new Date(snapshot.startsAt);
  const periodEndsAt = snapshot.coverageStartsNow ? addMonths(now, snapshot.termMonths) : new Date(snapshot.periodEndsAt);
  const first = snapshot.schedule.find((line) => line.kind === "first")!;
  const dueOn = laterDate(first.on, earliestDueOn(now));
  // Tracking carries on until the first debit has had its retries.
  const graceEndsAt = new Date(istMidnight(dueOn).getTime() + GRACE_MS);
  const [subscription] = await tx.insert(familySubscriptions).values({
    organizationId: intent.organizationId, customerId: intent.customerId, provider: mandate.provider, environment: mandate.environment, mandateId: mandate.id,
    currency: "INR", priceBookVersion: snapshot.priceBookVersion, perShoeMinor: snapshot.perShoeMinor,
    shoeCount: snapshot.shoeCount, termMonths: snapshot.termMonths, deviceIds: snapshot.deviceIds,
    state: startsAt <= now ? "active" : "scheduled", periodStartsAt: startsAt, periodEndsAt, graceEndsAt,
  }).returning();
  const breakdown: BillingChargeBreakdown = {
    perShoeMinor: snapshot.perShoeMinor, termMonths: snapshot.termMonths, deviceIds: snapshot.deviceIds, credits: snapshot.credits,
    coverage: snapshot.deviceIds.map((deviceId) => ({ deviceId, startsAt: startsAt.toISOString(), endsAt: periodEndsAt.toISOString() })),
    periodStartsAt: startsAt.toISOString(), periodEndsAt: periodEndsAt.toISOString(),
  };
  const [charge] = await tx.insert(billingCharges).values({
    subscriptionId: subscription.id, mandateId: mandate.id, organizationId: intent.organizationId, customerId: intent.customerId, provider: mandate.provider,
    kind: "first", dueOn, periodStartsAt: startsAt, amountMinor: first.amountMinor, baseMinor: first.baseMinor, creditMinor: first.creditMinor, breakdown,
  }).returning();
  const provisionalFrom = new Date(Math.max(now.getTime(), startsAt.getTime()));
  for (const deviceId of snapshot.deviceIds) {
    await grant(tx, { deviceId, organizationId: intent.organizationId, subscriptionId: subscription.id, grantKey: charge.id, source: "provisional", startsAt: provisionalFrom, endsAt: graceEndsAt });
  }
  // The free month is now part of the plan; it can't be credited again later.
  await tx.update(deviceActivations).set({ trialConvertedAt: now }).where(and(inArray(deviceActivations.deviceId, snapshot.deviceIds), isNull(deviceActivations.trialConvertedAt)));
  await tx.update(billingCheckoutIntents).set({ state: "completed", subscriptionId: subscription.id, updatedAt: now }).where(eq(billingCheckoutIntents.id, intent.id));
  await notifyPurchaser(tx, intent.organizationId, intent.customerId, { key: `autopay_set_up:${subscription.id}`, ...billingCopy.autopaySetUp(first.amountMinor, dueOn) });
  await tx.insert(billingAudit).values({ organizationId: intent.organizationId, action: "plan_started", details: { subscriptionId: subscription.id, mandateId: mandate.id, firstChargeId: charge.id, dueOn, amountMinor: first.amountMinor } });
}

// ---------------------------------------------------------------- Charges

/** How long a debit can still turn up after we gave up on it. */
const LATE_PAYMENT_WINDOW_MS = 7 * 86_400_000;

export async function refreshCharge(chargeId: string) {
  const [charge] = await db.select().from(billingCharges).where(eq(billingCharges.id, chargeId));
  if (!charge) return null;
  // In flight, or failed/cancelled after reaching the provider (a bank can still debit late).
  const reachedProvider = charge.status === "submitted" || ((charge.status === "failed" || charge.status === "cancelled") && charge.submittedAt && Date.now() - charge.submittedAt.getTime() < LATE_PAYMENT_WINDOW_MS);
  if (!reachedProvider) return null;
  await db.update(billingCharges).set({ lastCheckedAt: new Date() }).where(eq(billingCharges.id, charge.id));
  const provider = billingProvider(charge.provider);
  let snapshot: ChargeSnapshot;
  if (charge.kind === "one_time") snapshot = await provider.getPayment({ paymentRef: charge.id });
  else {
    const [mandate] = charge.mandateId ? await db.select().from(billingMandates).where(eq(billingMandates.id, charge.mandateId)) : [];
    snapshot = await provider.getCharge({ mandateRef: charge.mandateId ?? "", providerMandateId: mandate?.providerMandateId ?? null, chargeRef: charge.id });
  }
  await applyChargeSnapshot(charge.id, snapshot);
  return snapshot;
}

/** Whether money that arrived still buys something, or has to go back. */
async function paymentStillWanted(tx: BillingTransaction, charge: Charge) {
  const [subscription] = await tx.select().from(familySubscriptions).where(eq(familySubscriptions.id, charge.subscriptionId));
  if (!subscription || subscription.state === "expired" || subscription.state === "revoked") return false;
  if (charge.kind === "one_time") {
    const [settled] = charge.breakdown.settlesChargeId ? await tx.select().from(billingCharges).where(eq(billingCharges.id, charge.breakdown.settlesChargeId)) : [];
    return settled?.status === "failed";
  }
  // A cancelled autopay charge was stopped on purpose (cancel, replaced, plan changed).
  return charge.status !== "cancelled";
}

export async function applyChargeSnapshot(chargeId: string, snapshot: ChargeSnapshot) {
  const after: AfterCommit[] = [];
  await db.transaction(async (tx) => {
    const [initial] = await tx.select().from(billingCharges).where(eq(billingCharges.id, chargeId));
    if (!initial) return;
    await lockFor(tx, initial.customerId, initial.organizationId);
    const [charge] = await tx.select().from(billingCharges).where(eq(billingCharges.id, chargeId));
    const now = new Date();
    const inFlight = (IN_FLIGHT as readonly string[]).includes(charge.status);
    if (snapshot.status === "paid") {
      // Money taken is always recorded, even late or after we gave up on it.
      if (!inFlight && charge.status !== "failed" && charge.status !== "cancelled") return;
      const wanted = await paymentStillWanted(tx, charge);
      const paidAt = snapshot.paidAt ?? now;
      await tx.update(billingCharges).set({ status: "paid", paidAt, providerPaymentId: snapshot.providerPaymentId, failureReason: wanted ? null : `unexpected:${charge.failureReason ?? charge.status}`, nextAttemptOn: null, updatedAt: now }).where(eq(billingCharges.id, charge.id));
      if (wanted) {
        await applyPaid(tx, { ...charge, status: "paid", paidAt }, now);
        await notifyPurchaser(tx, charge.organizationId, charge.customerId, { key: `payment_received:${charge.id}`, ...billingCopy.paymentReceived(charge.amountMinor) });
      } else {
        const refund = await startRefund(tx, { ...charge, status: "paid" }, charge.amountMinor, "Payment taken after the charge was stopped", null, false);
        after.push(() => sendRefund(refund.id));
      }
      return;
    }
    if (!inFlight) return;
    if (snapshot.status === "failed") {
      // UPI keeps retrying on its own; the charge stays in flight until it gives up.
      if (snapshot.providerWillRetry) {
        await tx.update(billingCharges).set({ status: "submitted", failureReason: snapshot.failureReason, updatedAt: now }).where(eq(billingCharges.id, charge.id));
        return;
      }
      const [subscription] = await tx.select().from(familySubscriptions).where(eq(familySubscriptions.id, charge.subscriptionId));
      const movedToNewAutopay = Boolean(subscription && charge.mandateId && charge.mandateId !== subscription.mandateId);
      const retrying = Boolean(subscription && !subscription.cancelAtPeriodEnd && charge.kind !== "one_time" && (charge.attempts < MAX_CHARGE_ATTEMPTS || movedToNewAutopay));
      await tx.update(billingCharges).set({ status: "failed", failedAt: now, failureReason: snapshot.failureReason ?? "declined", providerPaymentId: snapshot.providerPaymentId, nextAttemptOn: retrying ? addDays(istDate(now), 1) : null, updatedAt: now }).where(eq(billingCharges.id, charge.id));
      if (subscription && (charge.kind === "first" || charge.kind === "renewal") && ["scheduled", "active"].includes(subscription.state)) {
        await tx.update(familySubscriptions).set({ state: "past_due", revision: subscription.revision + 1, updatedAt: now }).where(eq(familySubscriptions.id, subscription.id));
      }
      if (subscription?.organizationId) {
        const organizationId = subscription.organizationId;
        const key = `payment_failed:${charge.id}:${charge.attempts}`;
        await notifyPurchaser(tx, organizationId, charge.customerId, { key, ...billingCopy.paymentFailed(subscription.graceEndsAt, retrying) });
        if (charge.kind !== "one_time") await notifySafely(tx, async (sp) => {
          const purchaser = await purchaserUserId(sp, charge.customerId);
          await notifyFamily(sp, organizationId, { key, ...billingCopy.otherPaymentFailed(purchaser?.name ?? "The plan's payer", subscription.graceEndsAt) }, purchaser?.userId);
        });
      }
      await tx.insert(billingAudit).values({ organizationId: charge.organizationId, action: "charge_failed", details: { chargeId: charge.id, kind: charge.kind, reason: snapshot.failureReason, attempts: charge.attempts } });
    } else if (snapshot.status === "cancelled") {
      await tx.update(billingCharges).set({ status: "cancelled", failureReason: "cancelled_by_provider", updatedAt: now }).where(eq(billingCharges.id, charge.id));
    } else if (snapshot.providerPaymentId && snapshot.providerPaymentId !== charge.providerPaymentId) {
      await tx.update(billingCharges).set({ providerPaymentId: snapshot.providerPaymentId, updatedAt: now }).where(eq(billingCharges.id, charge.id));
    }
  });
  await runAfterCommit(after);
}

/** Grants what a paid charge bought and moves the plan forward. */
async function applyPaid(tx: BillingTransaction, paying: Charge, now: Date) {
  let target = paying;
  if (paying.kind === "one_time" && paying.breakdown.settlesChargeId) {
    const [settled] = await tx.select().from(billingCharges).where(eq(billingCharges.id, paying.breakdown.settlesChargeId));
    if (settled) {
      target = settled;
      await tx.update(billingCharges).set({ status: "cancelled", failureReason: "paid_separately", nextAttemptOn: null, updatedAt: now }).where(and(eq(billingCharges.id, settled.id), inArray(billingCharges.status, ["failed", "scheduled"])));
    }
  }
  const breakdown = target.breakdown;
  for (const item of breakdown.coverage) {
    const startsAt = new Date(item.startsAt);
    const endsAt = new Date(item.endsAt);
    await grant(tx, { deviceId: item.deviceId, organizationId: paying.organizationId, subscriptionId: paying.subscriptionId, grantKey: paying.id, source: "paid", startsAt, endsAt });
    await grant(tx, { deviceId: item.deviceId, organizationId: paying.organizationId, subscriptionId: paying.subscriptionId, grantKey: paying.id, source: "grace", startsAt: endsAt, endsAt: new Date(endsAt.getTime() + GRACE_MS) });
  }
  const [subscription] = await tx.select().from(familySubscriptions).where(eq(familySubscriptions.id, paying.subscriptionId));
  if (subscription) {
    const periodEndsAt = new Date(breakdown.periodEndsAt);
    const state = subscription.cancelAtPeriodEnd ? "cancelled" : "active";
    if (target.kind === "first") {
      await tx.update(familySubscriptions).set({ state: subscription.state === "expired" ? "expired" : state, graceEndsAt: new Date(periodEndsAt.getTime() + GRACE_MS), revision: subscription.revision + 1, updatedAt: now }).where(eq(familySubscriptions.id, subscription.id));
    } else if (target.kind === "renewal") {
      await tx.update(familySubscriptions).set({
        state, periodStartsAt: new Date(breakdown.periodStartsAt), periodEndsAt, graceEndsAt: new Date(periodEndsAt.getTime() + GRACE_MS),
        deviceIds: breakdown.deviceIds, shoeCount: breakdown.deviceIds.length, termMonths: breakdown.termMonths, perShoeMinor: breakdown.perShoeMinor,
        nextDeviceIds: null, nextTermMonths: null, revision: subscription.revision + 1, updatedAt: now,
      }).where(eq(familySubscriptions.id, subscription.id));
    }
  }
  await issueInvoice(tx, paying, target, now);
  await tx.insert(billingAudit).values({ organizationId: paying.organizationId, action: "charge_paid", details: { chargeId: paying.id, kind: target.kind, amountMinor: paying.amountMinor } });
}

export function describeCharge(kind: Charge["kind"], breakdown: BillingChargeBreakdown, names: Map<string, string>) {
  const shoes = breakdown.deviceIds.length === 1 ? "1 shoe" : `${breakdown.deviceIds.length} shoes`;
  const who = breakdown.deviceIds.map((id) => names.get(id)).filter(Boolean).join(", ");
  const plan = `${breakdown.termMonths}-month plan, ${shoes}`;
  if (kind === "renewal") return `Renewal · ${plan}`;
  if (kind === "add_shoes") return `${who || shoes} added`;
  if (kind === "one_time") return "Payment for a missed charge";
  if (kind === "verify") return "Autopay check";
  return plan;
}

async function issueInvoice(tx: BillingTransaction, paying: Charge, target: Charge, now: Date) {
  const issuedAt = paying.paidAt ?? now;
  const fy = financialYear(issuedAt);
  const [sequence] = await tx.insert(billingInvoiceSequences).values({ financialYear: fy, lastNumber: 1 })
    .onConflictDoUpdate({ target: billingInvoiceSequences.financialYear, set: { lastNumber: sql`${billingInvoiceSequences.lastNumber} + 1` } }).returning();
  const [buyer] = await tx.select({ name: users.name, email: users.email, phone: users.phoneNumber }).from(billingCustomers).leftJoin(users, eq(users.id, billingCustomers.userId)).where(eq(billingCustomers.id, paying.customerId));
  const names = await shoeNames(paying.organizationId, target.breakdown.deviceIds);
  const lines = [{ description: `Stepwhere Family · ${describeCharge(target.kind, target.breakdown, names)}`, amountMinor: target.baseMinor }];
  for (const credit of target.breakdown.credits) lines.push({ description: `Credit · ${names.get(credit.deviceId) ?? "a shoe"}'s ${credit.days} free days`, amountMinor: -credit.amountMinor });
  await tx.insert(billingInvoices).values({
    chargeId: paying.id, number: invoiceNumber(fy, sequence.lastNumber), financialYear: fy, issuedAt, amountMinor: paying.amountMinor,
    ...gstSplit(paying.amountMinor), buyer: { name: buyer?.name ?? null, email: buyer?.email ?? null, phone: buyer?.phone ?? null }, lines,
  }).onConflictDoNothing();
}

// ---------------------------------------------------------------- Refunds

/** Records a refund under the caller's locks; send it with sendRefund after commit. */
export async function startRefund(tx: BillingTransaction, charge: Charge, amountMinor: number, reason: string, actorUserId: string | null, revokeCoverage: boolean) {
  const [refund] = await tx.insert(billingRefunds).values({ chargeId: charge.id, amountMinor, reason, actorUserId, revokeCoverage }).returning();
  await tx.insert(billingAudit).values({ actorUserId, organizationId: charge.organizationId, action: "refund_requested", details: { refundId: refund.id, chargeId: charge.id, amountMinor, reason, revokeCoverage } });
  return refund;
}

export async function sendRefund(refundId: string) {
  const [refund] = await db.select().from(billingRefunds).where(eq(billingRefunds.id, refundId));
  const [charge] = await db.select().from(billingCharges).where(eq(billingCharges.id, refund.chargeId));
  const snapshot = await billingProvider(charge.provider).refund({ chargeRef: charge.id, mandateRef: charge.mandateId, refundRef: refund.id, amountMinor: refund.amountMinor, reason: refund.reason });
  await applyRefundSnapshot(refund.id, snapshot);
}

export async function refreshRefund(refundId: string) {
  const [refund] = await db.select().from(billingRefunds).where(eq(billingRefunds.id, refundId));
  if (!refund || refund.status !== "pending") return null;
  const [charge] = await db.select().from(billingCharges).where(eq(billingCharges.id, refund.chargeId));
  const snapshot = await billingProvider(charge.provider).getRefund({ chargeRef: charge.id, mandateRef: charge.mandateId, refundRef: refund.id });
  await applyRefundSnapshot(refund.id, snapshot);
  return snapshot;
}

export async function applyRefundSnapshot(refundId: string, snapshot: RefundSnapshot) {
  await db.transaction(async (tx) => {
    const [refund] = await tx.select().from(billingRefunds).where(eq(billingRefunds.id, refundId));
    if (!refund || refund.status !== "pending" || snapshot.status === "pending") return;
    const [charge] = await tx.select().from(billingCharges).where(eq(billingCharges.id, refund.chargeId));
    await lockFor(tx, charge.customerId, charge.organizationId);
    const now = new Date();
    await tx.update(billingRefunds).set({ status: snapshot.status, providerRefundId: snapshot.providerRefundId, updatedAt: now }).where(eq(billingRefunds.id, refund.id));
    if (snapshot.status !== "succeeded") return;
    const refundedMinor = Math.min(charge.amountMinor, charge.refundedMinor + refund.amountMinor);
    await tx.update(billingCharges).set({ refundedMinor, status: refundedMinor >= charge.amountMinor ? "refunded" : "partially_refunded", updatedAt: now }).where(eq(billingCharges.id, charge.id));
    if (refund.revokeCoverage) {
      await tx.update(deviceCoverageIntervals).set({ revokedAt: now }).where(and(eq(deviceCoverageIntervals.grantKey, charge.id), isNull(deviceCoverageIntervals.revokedAt)));
    }
    await tx.insert(billingAudit).values({ actorUserId: refund.actorUserId, organizationId: charge.organizationId, action: "refund_succeeded", details: { refundId: refund.id, chargeId: charge.id, amountMinor: refund.amountMinor, revokeCoverage: refund.revokeCoverage } });
  });
}
