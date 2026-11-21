// Changes the person who pays can make to a live plan.
import { and, desc, eq, inArray, isNull, ne } from "drizzle-orm";
import type { ApplyBillingQuoteInput, BillingChargeDto, BillingChargesDto, BillingPaymentTokenDto, BillingSubscriptionDto, ScheduleBillingRenewalInput } from "@stepwhere/types";
import { env } from "../../config/env";
import { db } from "../../db/client";
import { billingAudit, billingCharges, billingInvoices, billingMandates, billingQuotes, deviceActivations, deviceCoverageIntervals, familySubscriptions, users } from "../../db/schema";
import { AppError, badRequest, conflict, notFound } from "../../shared/errors";
import { GRACE_MS, type BillingTransaction } from "./billing-ownership.service";
import { earliestDueOn, istDate, istMidnight, laterDate } from "./billing-pricing";
import { describeCharge, IN_FLIGHT, restoreStoppedCharges, resumedState, runAfterCommit, stopRenewing, type AfterCommit } from "./billing-ledger.service";
import { MAX_SHOES, VERIFY_AMOUNT_MINOR, assertRevision, getBillingCustomer, getLiveSubscription, perShoePrice, requirePurchasesEnabled, requirePurchaser, shoeNames, subscriptionDto, validateSelection } from "./billing.service";
import { billingProvider } from "./providers";

type Subscription = typeof familySubscriptions.$inferSelect;

async function freshDto(subscriptionId: string, userId: string) {
  const [subscription] = await db.select().from(familySubscriptions).where(eq(familySubscriptions.id, subscriptionId));
  return subscriptionDto(subscription, userId);
}

/** A renewal already sent to the bank can't change; a scheduled one is dropped and rebuilt by the worker. */
async function resetPendingRenewal(tx: BillingTransaction, subscription: Subscription, now: Date) {
  const renewals = await tx.select().from(billingCharges).where(and(eq(billingCharges.subscriptionId, subscription.id), eq(billingCharges.kind, "renewal"), inArray(billingCharges.status, ["scheduled", ...IN_FLIGHT])));
  if (renewals.some((charge) => charge.status !== "scheduled")) throw new AppError(409, "BILLING_CONFLICT", "Your renewal is being charged right now. Try again once it has gone through.");
  if (renewals.length) await tx.update(billingCharges).set({ status: "cancelled", failureReason: "plan_changed", updatedAt: now }).where(inArray(billingCharges.id, renewals.map((charge) => charge.id)));
}

function requireRenewing(subscription: Subscription) {
  if (subscription.cancelAtPeriodEnd || !["scheduled", "active", "past_due"].includes(subscription.state)) {
    throw new AppError(409, "AUTOPAY_REQUIRED", "Turn autopay back on to change the plan.");
  }
}

export async function addShoes(organizationId: string, userId: string, input: ApplyBillingQuoteInput): Promise<BillingSubscriptionDto> {
  requirePurchasesEnabled();
  const subscriptionId = await db.transaction(async (tx) => {
    const { customer, subscription } = await requirePurchaser(tx, organizationId, userId);
    const [quote] = await tx.select().from(billingQuotes).where(and(eq(billingQuotes.id, input.quoteId), eq(billingQuotes.organizationId, organizationId), eq(billingQuotes.customerId, customer.id)));
    if (!quote || quote.snapshot.kind !== "add_shoes") throw notFound("NOT_FOUND", "Quote not found.");
    const snapshot = quote.snapshot;
    // Applying the same quote twice returns the plan as it is.
    if (snapshot.addedDeviceIds.every((id) => subscription.deviceIds.includes(id))) return subscription.id;
    if (quote.expiresAt <= new Date()) throw new AppError(409, "BILLING_QUOTE_EXPIRED", "Prices or dates may have changed. Review the change again.");
    if (snapshot.subscriptionId !== subscription.id || snapshot.subscriptionRevision !== subscription.revision) throw new AppError(409, "BILLING_CONFLICT", "The plan changed. Review the new price and try again.");
    if (subscription.cancelAtPeriodEnd || !["scheduled", "active"].includes(subscription.state)) throw new AppError(409, "AUTOPAY_REQUIRED", "Turn autopay back on before adding shoes.");
    await validateSelection(tx, organizationId, snapshot.deviceIds);
    const now = new Date();
    await resetPendingRenewal(tx, subscription, now);
    const nextDeviceIds = subscription.nextDeviceIds ? [...new Set([...subscription.nextDeviceIds, ...snapshot.addedDeviceIds])].sort() : null;
    if (nextDeviceIds && nextDeviceIds.length > MAX_SHOES) throw badRequest(`A plan covers at most ${MAX_SHOES} shoes.`);
    await tx.update(familySubscriptions).set({ deviceIds: snapshot.deviceIds, shoeCount: snapshot.deviceIds.length, nextDeviceIds, revision: subscription.revision + 1, updatedAt: now }).where(eq(familySubscriptions.id, subscription.id));
    const line = snapshot.schedule.find((item) => item.kind === "add_shoes");
    if (line) {
      const dueOn = laterDate(line.on, earliestDueOn(now));
      const [charge] = await tx.insert(billingCharges).values({
        subscriptionId: subscription.id, mandateId: subscription.mandateId, organizationId, customerId: customer.id, provider: subscription.provider,
        kind: "add_shoes", dueOn, periodStartsAt: now, amountMinor: line.amountMinor, baseMinor: line.baseMinor, creditMinor: 0,
        breakdown: {
          perShoeMinor: subscription.perShoeMinor, termMonths: subscription.termMonths, deviceIds: snapshot.addedDeviceIds, credits: [],
          coverage: snapshot.addedDeviceIds.map((deviceId) => ({ deviceId, startsAt: snapshot.deviceStartsAt[deviceId], endsAt: subscription.periodEndsAt.toISOString() })),
          periodStartsAt: subscription.periodStartsAt.toISOString(), periodEndsAt: subscription.periodEndsAt.toISOString(),
        },
      }).returning();
      const provisionalEndsAt = new Date(istMidnight(dueOn).getTime() + GRACE_MS);
      for (const deviceId of snapshot.addedDeviceIds) {
        const startsAt = new Date(Math.max(now.getTime(), Date.parse(snapshot.deviceStartsAt[deviceId])));
        if (provisionalEndsAt > startsAt) await tx.insert(deviceCoverageIntervals).values({ deviceId, organizationId, subscriptionId: subscription.id, grantKey: charge.id, source: "provisional", startsAt, endsAt: provisionalEndsAt }).onConflictDoNothing();
      }
    }
    await tx.update(deviceActivations).set({ trialConvertedAt: now }).where(and(inArray(deviceActivations.deviceId, snapshot.addedDeviceIds), isNull(deviceActivations.trialConvertedAt)));
    await tx.insert(billingAudit).values({ actorUserId: userId, organizationId, action: "shoes_added", details: { subscriptionId: subscription.id, quoteId: quote.id, deviceIds: snapshot.addedDeviceIds } });
    return subscription.id;
  });
  return freshDto(subscriptionId, userId);
}

export async function scheduleRenewal(organizationId: string, userId: string, input: ScheduleBillingRenewalInput): Promise<BillingSubscriptionDto> {
  const subscriptionId = await db.transaction(async (tx) => {
    const { subscription } = await requirePurchaser(tx, organizationId, userId);
    assertRevision(subscription, input.revision);
    requireRenewing(subscription);
    const sameShoes = (ids: string[]) => ids.length === subscription.deviceIds.length && [...ids].sort().every((id, index) => id === [...subscription.deviceIds].sort()[index]);
    const nextDeviceIds = input.nextDeviceIds && !sameShoes(input.nextDeviceIds) ? [...input.nextDeviceIds].sort() : null;
    const nextTermMonths = input.nextTermMonths && input.nextTermMonths !== subscription.termMonths ? input.nextTermMonths : null;
    if (nextDeviceIds) await validateSelection(tx, organizationId, nextDeviceIds);
    const term = nextTermMonths ?? subscription.termMonths;
    const perShoeMinor = term === subscription.termMonths ? subscription.perShoeMinor : await perShoePrice(tx, subscription.priceBookVersion, term);
    if (perShoeMinor * (nextDeviceIds ?? subscription.deviceIds).length > env.BILLING_MANDATE_MAX_MINOR) throw badRequest("That would take the plan above the autopay limit.");
    const now = new Date();
    await resetPendingRenewal(tx, subscription, now);
    await tx.update(familySubscriptions).set({ nextDeviceIds, nextTermMonths, revision: subscription.revision + 1, updatedAt: now }).where(eq(familySubscriptions.id, subscription.id));
    await tx.insert(billingAudit).values({ actorUserId: userId, organizationId, action: "renewal_scheduled", details: { subscriptionId: subscription.id, nextDeviceIds, nextTermMonths } });
    return subscription.id;
  });
  return freshDto(subscriptionId, userId);
}

export async function cancelPlan(organizationId: string, userId: string, revision: number): Promise<BillingSubscriptionDto> {
  const after: AfterCommit[] = [];
  const subscriptionId = await db.transaction(async (tx) => {
    const { subscription } = await requirePurchaser(tx, organizationId, userId);
    if (subscription.cancelAtPeriodEnd) return subscription.id;
    assertRevision(subscription, revision);
    const now = new Date();
    after.push(...await stopRenewing(tx, subscription, now, "cancelled_by_customer"));
    const [mandate] = await tx.select().from(billingMandates).where(eq(billingMandates.id, subscription.mandateId));
    await tx.update(billingMandates).set({ status: "cancelled", cancelledAt: now, updatedAt: now }).where(and(eq(billingMandates.id, subscription.mandateId), ne(billingMandates.status, "cancelled")));
    // The bank stops the autopay too. If this call fails, the mandate reconcile retries it.
    if (mandate) after.push(() => billingProvider(mandate.provider).cancelMandate({ mandateRef: mandate.id, providerMandateId: mandate.providerMandateId }));
    await tx.insert(billingAudit).values({ actorUserId: userId, organizationId, action: "plan_cancelled", details: { subscriptionId: subscription.id } });
    return subscription.id;
  });
  await runAfterCommit(after);
  return freshDto(subscriptionId, userId);
}

/** Undoes a cancel while the autopay still works. A cancelled autopay needs a new one instead. */
export async function resumePlan(organizationId: string, userId: string, revision: number): Promise<BillingSubscriptionDto> {
  const subscriptionId = await db.transaction(async (tx) => {
    const { subscription } = await requirePurchaser(tx, organizationId, userId);
    if (!subscription.cancelAtPeriodEnd) return subscription.id;
    assertRevision(subscription, revision);
    const [mandate] = await tx.select().from(billingMandates).where(eq(billingMandates.id, subscription.mandateId));
    if (mandate?.status !== "active") throw new AppError(409, "AUTOPAY_REQUIRED", "Set up autopay again to keep the plan.");
    const now = new Date();
    await tx.update(familySubscriptions).set({ cancelAtPeriodEnd: false, state: await resumedState(tx, subscription, now), revision: subscription.revision + 1, updatedAt: now }).where(eq(familySubscriptions.id, subscription.id));
    await restoreStoppedCharges(tx, subscription, mandate.id, now);
    await tx.insert(billingAudit).values({ actorUserId: userId, organizationId, action: "plan_resumed", details: { subscriptionId: subscription.id } });
    return subscription.id;
  });
  return freshDto(subscriptionId, userId);
}

/** A one-off payment for a failed charge, outside the autopay. */
export async function payNow(organizationId: string, userId: string, chargeId: string): Promise<{ chargeId: string; token: BillingPaymentTokenDto }> {
  requirePurchasesEnabled();
  const prepared = await db.transaction(async (tx) => {
    const { customer, subscription } = await requirePurchaser(tx, organizationId, userId);
    const [failed] = await tx.select().from(billingCharges).where(and(eq(billingCharges.id, chargeId), eq(billingCharges.subscriptionId, subscription.id)));
    if (!failed) throw notFound("NOT_FOUND", "Charge not found.");
    if (failed.status !== "failed") throw conflict("This charge doesn't need paying.");
    const now = new Date();
    // Stop autopay retries so the bank can't take the same amount twice.
    await tx.update(billingCharges).set({ nextAttemptOn: null, updatedAt: now }).where(eq(billingCharges.id, failed.id));
    // An earlier pay-now stays open: if both get paid, the second is refunded automatically.
    const [payment] = await tx.insert(billingCharges).values({
      subscriptionId: subscription.id, organizationId, customerId: customer.id, provider: subscription.provider, kind: "one_time", status: "submitted",
      dueOn: istDate(now), periodStartsAt: now, amountMinor: failed.amountMinor, baseMinor: failed.baseMinor, creditMinor: failed.creditMinor,
      breakdown: { ...failed.breakdown, settlesChargeId: failed.id }, submittedAt: now, attempts: 1,
    }).returning();
    return { payment, provider: subscription.provider };
  });
  const [user] = await db.select({ name: users.name, email: users.email, phone: users.phoneNumber }).from(users).where(eq(users.id, userId));
  try {
    const { token } = await billingProvider(prepared.provider).createPayment({ paymentRef: prepared.payment.id, amountMinor: prepared.payment.amountMinor, customer: { name: user.name, email: user.email, phone: user.phone }, note: "Stepwhere family plan" });
    return { chargeId: prepared.payment.id, token };
  } catch (error) {
    await db.update(billingCharges).set({ status: "cancelled", failureReason: "provider_error", updatedAt: new Date() }).where(eq(billingCharges.id, prepared.payment.id));
    if (error instanceof AppError) throw error;
    throw new AppError(503, "SERVICE_UNAVAILABLE", "Couldn't reach the payment service. You haven't been charged.");
  }
}

/** Payments and invoices, for the person who pays. */
export async function listCharges(organizationId: string, userId: string): Promise<BillingChargesDto> {
  const customer = await getBillingCustomer(userId);
  const live = await getLiveSubscription(organizationId);
  if (live && live.customerId !== customer.id) throw new AppError(403, "NOT_PURCHASER", "Only the person who pays for the plan can see its invoices.");
  const rows = await db.select({ charge: billingCharges, invoice: billingInvoices, mandate: billingMandates }).from(billingCharges)
    .leftJoin(billingInvoices, eq(billingInvoices.chargeId, billingCharges.id)).leftJoin(billingMandates, eq(billingMandates.id, billingCharges.mandateId))
    .where(and(eq(billingCharges.organizationId, organizationId), eq(billingCharges.customerId, customer.id), inArray(billingCharges.status, [...IN_FLIGHT, "paid", "failed", "refunded", "partially_refunded"])))
    .orderBy(desc(billingCharges.dueOn), desc(billingCharges.createdAt));
  const names = await shoeNames(organizationId, [...new Set(rows.flatMap((row) => row.charge.breakdown.deviceIds))]);
  const charges: BillingChargeDto[] = rows.map(({ charge, invoice, mandate }) => ({
    id: charge.id, kind: charge.kind, status: charge.status === "submitting" ? "submitted" : charge.status, dueOn: charge.dueOn, amountMinor: charge.amountMinor,
    retryOn: charge.status === "failed" ? charge.nextAttemptOn : null,
    baseMinor: charge.baseMinor, creditMinor: charge.creditMinor, refundedMinor: charge.refundedMinor,
    paidAt: charge.paidAt?.toISOString() ?? null, failureReason: charge.failureReason,
    description: describeCharge(charge.kind, charge.breakdown, names),
    method: { kind: mandate?.method ?? null, label: mandate?.methodLabel ?? null },
    invoice: invoice ? { number: invoice.number, issuedAt: invoice.issuedAt.toISOString(), taxableMinor: invoice.taxableMinor, cgstMinor: invoice.cgstMinor, sgstMinor: invoice.sgstMinor, igstMinor: invoice.igstMinor, pdfUrl: null } : null,
  }));
  // The ₹1 UPI or card check when autopay was set up, refunded straight away.
  const mandates = await db.select().from(billingMandates).where(and(eq(billingMandates.organizationId, organizationId), eq(billingMandates.customerId, customer.id)));
  for (const mandate of mandates) {
    if (!mandate.authorizedAt || (mandate.method !== "upi" && mandate.method !== "card")) continue;
    charges.push({
      id: mandate.id, kind: "verify", status: "refunded", dueOn: istDate(mandate.authorizedAt), amountMinor: VERIFY_AMOUNT_MINOR, retryOn: null,
      baseMinor: VERIFY_AMOUNT_MINOR, creditMinor: 0, refundedMinor: VERIFY_AMOUNT_MINOR, paidAt: mandate.authorizedAt.toISOString(), failureReason: null,
      description: "Autopay check", method: { kind: mandate.method, label: mandate.methodLabel }, invoice: null,
    });
  }
  charges.sort((a, b) => b.dueOn.localeCompare(a.dueOn));
  return { charges };
}
