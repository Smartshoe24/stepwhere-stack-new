import { and, desc, eq, gt, inArray, isNull, lte, max, sql } from "drizzle-orm";
import type { BillingAutopayStatus, BillingChargeSummaryDto, BillingDeviceDto, BillingOverviewDto, BillingPricesDto, BillingQuoteDto, BillingSubscriptionDto, CreateBillingQuoteInput } from "@stepwhere/types";
import { env } from "../../config/env";
import { db } from "../../db/client";
import { billingCharges, billingCheckoutIntents, billingCustomers, billingMandates, billingPriceBook, billingQuotes, childDeviceBindings, children, deviceActivations, deviceCoverageIntervals, deviceOwnerships, devices, familySubscriptions, users, type BillingQuoteSnapshot, type BillingTerm, type MandateStatus } from "../../db/schema";
import { AppError, badRequest, forbidden } from "../../shared/errors";
import { billingEnforced } from "./billing-coverage.service";
import { DAY_MS, GRACE_MS, type BillingTransaction } from "./billing-ownership.service";
import { istDate, quoteAddShoes, quoteNewPlan } from "./billing-pricing";

export const MAX_SHOES = 5;
export const VERIFY_AMOUNT_MINOR = 100;
export const QUOTE_TTL_MS = 15 * 60_000;
// A subscription in these states still covers shoes or is about to.
export const LIVE_STATES = ["scheduled", "active", "past_due", "cancelled"] as const;
type Executor = typeof db | BillingTransaction;

export function requirePurchasesEnabled() {
  if (!env.BILLING_PURCHASES_ENABLED) throw new AppError(503, "BILLING_DISABLED", "Subscription purchases are not available yet.");
}

export async function lockBilling(tx: BillingTransaction, key: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`billing:${key}`}, 0))`);
}

export async function getBillingCustomer(userId: string, executor: Executor = db) {
  await executor.insert(billingCustomers).values({ userId }).onConflictDoNothing();
  const [customer] = await executor.select().from(billingCustomers).where(eq(billingCustomers.userId, userId));
  return customer;
}

/** A person pays for at most one family's plan, because the autopay is theirs. */
export async function assertNoOtherFamilyPlan(executor: Executor, customerId: string, organizationId: string) {
  const [other] = await executor.select({ organizationId: familySubscriptions.organizationId }).from(familySubscriptions).where(and(eq(familySubscriptions.customerId, customerId), inArray(familySubscriptions.state, [...LIVE_STATES]))).limit(1);
  if (other && other.organizationId !== organizationId) throw new AppError(409, "PLAN_EXISTS", "You already pay for another family's plan.");
}

export async function getLiveSubscription(organizationId: string, executor: Executor = db) {
  const [subscription] = await executor.select().from(familySubscriptions).where(and(eq(familySubscriptions.organizationId, organizationId), inArray(familySubscriptions.state, [...LIVE_STATES]))).limit(1);
  return subscription ?? null;
}

async function getLatestSubscription(organizationId: string) {
  const [subscription] = await db.select().from(familySubscriptions).where(eq(familySubscriptions.organizationId, organizationId)).orderBy(desc(familySubscriptions.createdAt)).limit(1);
  return subscription ?? null;
}

/** The person who pays is the only one who can change the plan, whatever their family role. */
export async function requirePurchaser(tx: BillingTransaction, organizationId: string, userId: string) {
  const customer = await getBillingCustomer(userId, tx);
  await lockBilling(tx, customer.id);
  await lockBilling(tx, organizationId);
  const subscription = await getLiveSubscription(organizationId, tx);
  if (!subscription) throw new AppError(404, "SUBSCRIPTION_NOT_FOUND", "Your family doesn't have a plan.");
  if (subscription.customerId !== customer.id) throw new AppError(403, "NOT_PURCHASER", "Only the person who pays for the plan can change it.");
  return { customer, subscription };
}

export function assertRevision(subscription: { revision: number }, revision: number) {
  if (subscription.revision !== revision) throw new AppError(409, "BILLING_CONFLICT", "The plan changed. Refresh and try again.");
}

// ---------------------------------------------------------------- Prices

export async function currentPriceVersion(executor: Executor = db, now = new Date()) {
  const [row] = await executor.select({ version: max(billingPriceBook.version) }).from(billingPriceBook).where(and(eq(billingPriceBook.currency, "INR"), lte(billingPriceBook.activeFrom, now)));
  if (!row?.version) throw new AppError(503, "BILLING_DISABLED", "Prices are not configured.");
  return row.version;
}

export async function perShoePrice(executor: Executor, version: number, termMonths: BillingTerm) {
  const [row] = await executor.select().from(billingPriceBook).where(and(eq(billingPriceBook.version, version), eq(billingPriceBook.currency, "INR"), eq(billingPriceBook.termMonths, termMonths)));
  if (!row) throw new AppError(503, "BILLING_DISABLED", `No ${termMonths}-month price is configured.`);
  return row.perShoeMinor;
}

export async function getPrices(executor: Executor = db): Promise<BillingPricesDto> {
  const version = await currentPriceVersion(executor);
  const rows = await executor.select().from(billingPriceBook).where(and(eq(billingPriceBook.version, version), eq(billingPriceBook.currency, "INR"))).orderBy(billingPriceBook.termMonths);
  return { currency: "INR", version, maxShoes: MAX_SHOES, mandateMaxMinor: env.BILLING_MANDATE_MAX_MINOR, prices: rows.map((row) => ({ termMonths: row.termMonths, perShoeMinor: row.perShoeMinor })) };
}

// ---------------------------------------------------------------- Shoes

export async function validateSelection(tx: Executor, organizationId: string, deviceIds: string[]) {
  if (deviceIds.length < 1 || deviceIds.length > MAX_SHOES || new Set(deviceIds).size !== deviceIds.length) throw badRequest(`Select between one and ${MAX_SHOES} different shoes.`);
  const owned = await tx.select({ deviceId: deviceOwnerships.deviceId }).from(deviceOwnerships).innerJoin(devices, eq(devices.id, deviceOwnerships.deviceId)).where(and(eq(deviceOwnerships.organizationId, organizationId), isNull(deviceOwnerships.releasedAt), inArray(deviceOwnerships.deviceId, deviceIds), sql`${devices.status} != 'blocked'`));
  if (owned.length !== deviceIds.length) throw forbidden("Every selected shoe must belong to this family and must not be blocked.");
}

/** When each shoe's free month ends, or null once it has been used up by a plan. */
async function freeMonthEnds(tx: Executor, deviceIds: string[]) {
  const rows = await tx.select().from(deviceActivations).where(inArray(deviceActivations.deviceId, deviceIds));
  return deviceIds.map((deviceId) => {
    const row = rows.find((candidate) => candidate.deviceId === deviceId);
    return { deviceId, trialEndsAt: row && !row.trialConvertedAt ? row.trialEndsAt : null };
  });
}

// ---------------------------------------------------------------- Quotes

export async function createBillingQuote(organizationId: string, userId: string, input: CreateBillingQuoteInput): Promise<BillingQuoteDto> {
  requirePurchasesEnabled();
  return db.transaction(async (tx) => {
    const customer = await getBillingCustomer(userId, tx);
    await lockBilling(tx, customer.id);
    await lockBilling(tx, organizationId);
    const now = new Date();
    const live = await getLiveSubscription(organizationId, tx);
    let snapshot: BillingQuoteSnapshot;
    if (input.kind === "new_plan") {
      if (live) throw new AppError(409, "PLAN_EXISTS", "Your family already has a plan.");
      await assertNoOtherFamilyPlan(tx, customer.id, organizationId);
      await validateSelection(tx, organizationId, input.deviceIds);
      const version = await currentPriceVersion(tx, now);
      const perShoeMinor = await perShoePrice(tx, version, input.termMonths);
      const quote = quoteNewPlan({ now, perShoeMinor, termMonths: input.termMonths, devices: await freeMonthEnds(tx, input.deviceIds) });
      const deviceIds = [...input.deviceIds].sort();
      snapshot = {
        kind: "new_plan", deviceIds, addedDeviceIds: deviceIds, shoeCount: deviceIds.length, termMonths: input.termMonths,
        currency: "INR", priceBookVersion: version, perShoeMinor, renewalAmountMinor: quote.renewal.amountMinor,
        startsAt: quote.startsAt.toISOString(), periodEndsAt: quote.periodEndsAt.toISOString(), coverageStartsNow: quote.coverageStartsNow,
        deviceStartsAt: Object.fromEntries(deviceIds.map((id) => [id, quote.startsAt.toISOString()])),
        credits: quote.credits,
        schedule: [
          { kind: "verify", on: istDate(now), amountMinor: VERIFY_AMOUNT_MINOR, baseMinor: VERIFY_AMOUNT_MINOR, creditMinor: 0, deviceIds: [], refunded: true },
          { kind: "first", on: quote.firstCharge.on, amountMinor: quote.firstCharge.amountMinor, baseMinor: quote.baseMinor, creditMinor: quote.creditMinor, deviceIds, refunded: false },
          { kind: "renewal", on: quote.renewal.on, amountMinor: quote.renewal.amountMinor, baseMinor: quote.renewal.amountMinor, creditMinor: 0, deviceIds, refunded: false },
        ],
        mandateMaxMinor: env.BILLING_MANDATE_MAX_MINOR, subscriptionId: null, subscriptionRevision: null,
      };
    } else {
      if (!live) throw new AppError(404, "SUBSCRIPTION_NOT_FOUND", "Your family doesn't have a plan.");
      if (live.customerId !== customer.id) throw new AppError(403, "NOT_PURCHASER", "Only the person who pays for the plan can change it.");
      if (live.cancelAtPeriodEnd || !["scheduled", "active"].includes(live.state)) throw new AppError(409, "AUTOPAY_REQUIRED", "Turn autopay back on before adding shoes.");
      const added = [...new Set(input.deviceIds)].filter((id) => !live.deviceIds.includes(id)).sort();
      if (!added.length) throw badRequest("Those shoes are already on the plan.");
      const deviceIds = [...live.deviceIds, ...added].sort();
      await validateSelection(tx, organizationId, deviceIds);
      const quote = quoteAddShoes({ now, perShoeMinor: live.perShoeMinor, currentShoeCount: live.shoeCount, periodStartsAt: live.periodStartsAt, periodEndsAt: live.periodEndsAt, devices: await freeMonthEnds(tx, added) });
      if (quote.renewal.amountMinor > env.BILLING_MANDATE_MAX_MINOR) throw badRequest("That would take the plan above the autopay limit.");
      snapshot = {
        kind: "add_shoes", deviceIds, addedDeviceIds: added, shoeCount: deviceIds.length, termMonths: live.termMonths,
        currency: "INR", priceBookVersion: live.priceBookVersion, perShoeMinor: live.perShoeMinor, renewalAmountMinor: quote.renewal.amountMinor,
        startsAt: quote.startsAt.toISOString(), periodEndsAt: live.periodEndsAt.toISOString(), coverageStartsNow: quote.coverageStartsNow,
        deviceStartsAt: Object.fromEntries(quote.deviceStarts.map((device) => [device.deviceId, device.startsAt.toISOString()])),
        credits: [],
        schedule: [
          ...(quote.charge ? [{ kind: "add_shoes" as const, on: quote.charge.on, amountMinor: quote.charge.amountMinor, baseMinor: quote.charge.amountMinor, creditMinor: 0, deviceIds: added, refunded: false }] : []),
          { kind: "renewal", on: quote.renewal.on, amountMinor: quote.renewal.amountMinor, baseMinor: quote.renewal.amountMinor, creditMinor: 0, deviceIds, refunded: false },
        ],
        mandateMaxMinor: env.BILLING_MANDATE_MAX_MINOR, subscriptionId: live.id, subscriptionRevision: live.revision,
      };
    }
    const [row] = await tx.insert(billingQuotes).values({ organizationId, customerId: customer.id, snapshot, expiresAt: new Date(now.getTime() + QUOTE_TTL_MS) }).returning();
    return quoteDto(row.id, snapshot, row.expiresAt);
  });
}

export function quoteDto(id: string, snapshot: BillingQuoteSnapshot, expiresAt: Date): BillingQuoteDto {
  return {
    id, kind: snapshot.kind, expiresAt: expiresAt.toISOString(), currency: snapshot.currency,
    deviceIds: snapshot.deviceIds, addedDeviceIds: snapshot.addedDeviceIds, shoeCount: snapshot.shoeCount, termMonths: snapshot.termMonths,
    perShoeMinor: snapshot.perShoeMinor, renewalAmountMinor: snapshot.renewalAmountMinor,
    startsAt: snapshot.startsAt, periodEndsAt: snapshot.periodEndsAt, coverageStartsNow: snapshot.coverageStartsNow,
    credits: snapshot.credits, schedule: snapshot.schedule,
    requiresMandate: snapshot.kind === "new_plan", mandateMaxMinor: snapshot.mandateMaxMinor,
  };
}

/** Loads a quote the caller made and hasn't let expire. */
export async function loadQuote(tx: BillingTransaction, organizationId: string, customerId: string, quoteId: string, kind: BillingQuoteSnapshot["kind"]) {
  const [quote] = await tx.select().from(billingQuotes).where(and(eq(billingQuotes.id, quoteId), eq(billingQuotes.organizationId, organizationId), eq(billingQuotes.customerId, customerId)));
  if (!quote || quote.snapshot.kind !== kind) throw new AppError(404, "NOT_FOUND", "Quote not found.");
  if (quote.expiresAt <= new Date()) throw new AppError(409, "BILLING_QUOTE_EXPIRED", "Prices or dates may have changed. Review the plan again.");
  return quote;
}

// ---------------------------------------------------------------- Reads

const AUTOPAY_STATUS: Record<MandateStatus, BillingAutopayStatus> = {
  active: "active", bank_pending: "bank_pending", customer_cancelled: "off_by_customer", customer_paused: "paused_by_customer",
  cancelled: "cancelled", card_expired: "card_expired", failed: "failed", expired: "failed", pending_authorization: "failed",
};

const chargeSummary = (charge: typeof billingCharges.$inferSelect): BillingChargeSummaryDto => ({
  id: charge.id, kind: charge.kind, status: charge.status === "submitting" ? "submitted" : charge.status, dueOn: charge.dueOn, amountMinor: charge.amountMinor, retryOn: charge.status === "failed" ? charge.nextAttemptOn : null,
});

export async function subscriptionDto(subscription: typeof familySubscriptions.$inferSelect, userId: string): Promise<BillingSubscriptionDto> {
  const [[mandate], charges, [purchaser], [pendingCheckout]] = await Promise.all([
    db.select().from(billingMandates).where(eq(billingMandates.id, subscription.mandateId)),
    db.select().from(billingCharges).where(and(eq(billingCharges.subscriptionId, subscription.id), inArray(billingCharges.kind, ["first", "renewal", "add_shoes"]))).orderBy(billingCharges.dueOn),
    db.select({ userId: billingCustomers.userId, name: users.name }).from(billingCustomers).leftJoin(users, eq(users.id, billingCustomers.userId)).where(eq(billingCustomers.id, subscription.customerId)),
    db.select({ id: billingCheckoutIntents.id }).from(billingCheckoutIntents).where(and(eq(billingCheckoutIntents.subscriptionId, subscription.id), inArray(billingCheckoutIntents.state, ["awaiting_authorization", "bank_pending"]), gt(billingCheckoutIntents.expiresAt, new Date()))).limit(1),
  ]);
  const upcoming = charges.find((charge) => charge.status === "scheduled" || charge.status === "submitting" || charge.status === "submitted");
  const failed = charges.filter((charge) => charge.status === "failed").at(-1);
  return {
    id: subscription.id, state: subscription.state, currency: subscription.currency,
    shoeCount: subscription.shoeCount, termMonths: subscription.termMonths, deviceIds: subscription.deviceIds,
    nextDeviceIds: subscription.nextDeviceIds, nextTermMonths: subscription.nextTermMonths,
    perShoeMinor: subscription.perShoeMinor, renewalAmountMinor: await renewalAmount(subscription),
    periodStartsAt: subscription.periodStartsAt.toISOString(), periodEndsAt: subscription.periodEndsAt.toISOString(), graceEndsAt: subscription.graceEndsAt.toISOString(),
    cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
    nextCharge: upcoming ? chargeSummary(upcoming) : null,
    failedCharge: failed ? chargeSummary(failed) : null,
    autopay: { status: mandate ? AUTOPAY_STATUS[mandate.status] : "failed", method: mandate?.method ?? null, label: mandate?.methodLabel ?? null },
    pendingCheckoutId: pendingCheckout?.id ?? null,
    purchaser: { isYou: purchaser?.userId === userId, name: purchaser?.name ?? null },
    revision: subscription.revision,
  };
}

/** What the next period will cost, including scheduled shoe and period changes. */
export async function renewalAmount(subscription: typeof familySubscriptions.$inferSelect, executor: Executor = db) {
  const term = subscription.nextTermMonths ?? subscription.termMonths;
  const perShoeMinor = term === subscription.termMonths ? subscription.perShoeMinor : await perShoePrice(executor, subscription.priceBookVersion, term);
  return perShoeMinor * (subscription.nextDeviceIds ?? subscription.deviceIds).length;
}

export async function getSubscriptionDto(organizationId: string, userId: string) {
  const subscription = await getLatestSubscription(organizationId);
  return subscription ? subscriptionDto(subscription, userId) : null;
}

export async function listBillingDevices(organizationId: string): Promise<BillingDeviceDto[]> {
  const rows = await db.select({ device: devices, activation: deviceActivations, childId: childDeviceBindings.childId }).from(deviceOwnerships)
    .innerJoin(devices, eq(devices.id, deviceOwnerships.deviceId)).innerJoin(deviceActivations, eq(deviceActivations.deviceId, devices.id))
    .leftJoin(childDeviceBindings, and(eq(childDeviceBindings.deviceId, devices.id), isNull(childDeviceBindings.unboundAt)))
    .where(and(eq(deviceOwnerships.organizationId, organizationId), isNull(deviceOwnerships.releasedAt))).orderBy(deviceOwnerships.claimedAt);
  const now = new Date();
  const subscription = await getLiveSubscription(organizationId);
  const grants = await db.select().from(deviceCoverageIntervals).where(and(eq(deviceCoverageIntervals.organizationId, organizationId), isNull(deviceCoverageIntervals.revokedAt), gt(deviceCoverageIntervals.endsAt, now)));
  const renews = Boolean(subscription && !subscription.cancelAtPeriodEnd && (subscription.state === "active" || subscription.state === "scheduled"));
  return rows.map(({ device, activation, childId }) => {
    const active = grants.filter((g) => g.deviceId === device.id && g.startsAt <= now).sort((a, b) => b.endsAt.getTime() - a.endsAt.getTime());
    const paid = active.find((g) => g.source === "paid" || g.source === "support");
    const trial = active.find((g) => g.source === "trial");
    const provisional = active.find((g) => g.source === "provisional");
    const grace = active.find((g) => g.source === "grace");
    const coverage = paid ?? trial ?? provisional ?? grace ?? active[0];
    // The latest end across every touching grant, so "covered until" doesn't stop at a trial boundary.
    const coveredUntil = active.length ? new Date(Math.max(...grants.filter((g) => g.deviceId === device.id).map((g) => g.endsAt.getTime()))) : null;
    const onPlan = Boolean(subscription?.deviceIds.includes(device.id));
    const nextOnPlan = subscription?.nextDeviceIds ? subscription.nextDeviceIds.includes(device.id) : null;
    const trialLeftMs = activation.trialConvertedAt ? 0 : activation.trialEndsAt.getTime() - now.getTime();
    return {
      deviceId: device.id, hardwareIdentifier: device.hardwareIdentifier, displayName: device.displayName, childId: childId ?? null,
      trialStartsAt: activation.activatedAt.toISOString(), trialEndsAt: activation.trialEndsAt.toISOString(),
      trialDaysRemaining: Math.max(0, Math.min(30, trialLeftMs / DAY_MS)),
      coverage: coverage?.source ?? "expired", coveredUntil: coveredUntil?.toISOString() ?? null,
      graceEndsAt: grace?.endsAt.toISOString() ?? (trial ? new Date(activation.trialEndsAt.getTime() + GRACE_MS).toISOString() : null),
      expiringSoon: !(renews && onPlan) && Boolean(coveredUntil && coveredUntil.getTime() - now.getTime() <= 7 * DAY_MS),
      onPlan, nextOnPlan,
      autoRenews: renews && (nextOnPlan ?? onPlan), enforcementEnabled: billingEnforced(organizationId),
    };
  });
}

export async function getBillingOverview(organizationId: string, userId: string): Promise<BillingOverviewDto> {
  const [prices, devicesList, subscription, [pending]] = await Promise.all([
    getPrices(),
    listBillingDevices(organizationId),
    getSubscriptionDto(organizationId, userId),
    db.select({ id: billingCheckoutIntents.id, state: billingCheckoutIntents.state, startedBy: billingCustomers.userId, name: users.name }).from(billingCheckoutIntents)
      .innerJoin(billingCustomers, eq(billingCustomers.id, billingCheckoutIntents.customerId)).leftJoin(users, eq(users.id, billingCustomers.userId))
      .where(and(eq(billingCheckoutIntents.organizationId, organizationId), eq(billingCheckoutIntents.kind, "new_plan"), inArray(billingCheckoutIntents.state, ["awaiting_authorization", "bank_pending"]), gt(billingCheckoutIntents.expiresAt, new Date()))).limit(1),
  ]);
  return {
    purchasesEnabled: env.BILLING_PURCHASES_ENABLED, enforcementEnabled: billingEnforced(organizationId),
    prices, devices: devicesList, subscription,
    pendingCheckout: pending ? { id: pending.id, state: pending.state as "awaiting_authorization" | "bank_pending", isYou: pending.startedBy === userId, startedByName: pending.name ?? null } : null,
  };
}

/** Child names for each shoe, for charge descriptions and invoices. */
export async function shoeNames(organizationId: string | null, deviceIds: string[]) {
  if (!organizationId || !deviceIds.length) return new Map<string, string>();
  const rows = await db.select({ deviceId: childDeviceBindings.deviceId, name: children.name }).from(childDeviceBindings).innerJoin(children, eq(children.id, childDeviceBindings.childId))
    .where(and(inArray(childDeviceBindings.deviceId, deviceIds), eq(children.organizationId, organizationId), isNull(childDeviceBindings.unboundAt)));
  return new Map(rows.map((row) => [row.deviceId, row.name]));
}
