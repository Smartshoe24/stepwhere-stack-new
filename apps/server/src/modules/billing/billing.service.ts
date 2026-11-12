import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { and, desc, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import type { BillingDeviceDto, BillingSubscriptionDto, CreateBillingQuoteInput } from "@stepwhere/types";
import { env } from "../../config/env";
import { db } from "../../db/client";
import { billingCatalog, billingCheckoutIntents, billingCustomers, billingOfferCodes, billingQuotes, childDeviceBindings, children, deviceActivations, deviceCoverageIntervals, deviceOwnerships, devices, familySubscriptions, type BillingQuoteSnapshot } from "../../db/schema";
import { AppError, badRequest, conflict, forbidden, notFound } from "../../shared/errors";
import { billingEnforced } from "./billing-coverage.service";
import { DAY_MS, GRACE_MS, type BillingTransaction } from "./billing-ownership.service";

export function requirePurchasesEnabled() {
  if (!env.BILLING_PURCHASES_ENABLED) throw new AppError(503, "BILLING_DISABLED", "Subscription purchases are not available yet.");
}

export async function lockBilling(tx: BillingTransaction, key: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`billing:${key}`}, 0))`);
}

export async function getBillingCustomer(userId: string, executor: typeof db | BillingTransaction = db) {
  await executor.insert(billingCustomers).values({ userId }).onConflictDoNothing();
  const [customer] = await executor.select().from(billingCustomers).where(eq(billingCustomers.userId, userId));
  return customer;
}

export async function getFamilySubscription(organizationId: string, executor: typeof db | BillingTransaction = db) {
  const [subscription] = await executor.select().from(familySubscriptions).where(eq(familySubscriptions.organizationId, organizationId)).orderBy(desc(familySubscriptions.lastVerifiedAt)).limit(1);
  return subscription ?? null;
}

export async function subscriptionDto(organizationId: string, userId: string): Promise<BillingSubscriptionDto | null> {
  const subscription = await getFamilySubscription(organizationId);
  if (!subscription) return null;
  const [customer] = await db.select().from(billingCustomers).where(eq(billingCustomers.id, subscription.customerId));
  return { id: subscription.id, store: subscription.store, environment: subscription.environment, shoeCount: subscription.shoeCount, termMonths: subscription.termMonths as 3 | 6 | 12, deviceIds: subscription.deviceIds, nextDeviceIds: subscription.nextDeviceIds, state: subscription.state, autoRenews: subscription.autoRenews, periodStartsAt: subscription.periodStartsAt.toISOString(), periodEndsAt: subscription.periodEndsAt.toISOString(), graceEndsAt: subscription.graceEndsAt.toISOString(), revision: subscription.revision, isPurchaser: customer?.userId === userId };
}

export async function listBillingDevices(organizationId: string): Promise<BillingDeviceDto[]> {
  const rows = await db.select({ device: devices, activation: deviceActivations, childId: childDeviceBindings.childId }).from(deviceOwnerships)
    .innerJoin(devices, eq(devices.id, deviceOwnerships.deviceId)).innerJoin(deviceActivations, eq(deviceActivations.deviceId, devices.id))
    .leftJoin(childDeviceBindings, and(eq(childDeviceBindings.deviceId, devices.id), isNull(childDeviceBindings.unboundAt)))
    .where(and(eq(deviceOwnerships.organizationId, organizationId), isNull(deviceOwnerships.releasedAt))).orderBy(deviceOwnerships.claimedAt);
  const now = new Date();
  const subscription = await getFamilySubscription(organizationId);
  const grants = await db.select().from(deviceCoverageIntervals).where(and(eq(deviceCoverageIntervals.organizationId, organizationId), isNull(deviceCoverageIntervals.revokedAt), gt(deviceCoverageIntervals.endsAt, now)));
  return rows.map(({ device, activation, childId }) => {
    const active = grants.filter((g) => g.deviceId === device.id && g.startsAt <= now).sort((a, b) => b.endsAt.getTime() - a.endsAt.getTime());
    const paid = active.find((g) => g.source === "paid" || g.source === "support");
    const trial = active.find((g) => g.source === "trial");
    const grace = active.find((g) => g.source === "grace");
    const coverage = paid ?? trial ?? grace ?? active[0];
    const scheduledGrace = coverage ? grants.find((g) => g.deviceId === device.id && g.source === "grace" && g.grantKey === coverage.grantKey) : undefined;
    const renewing = Boolean(subscription?.autoRenews && subscription.state === "active" && subscription.deviceIds.includes(device.id) && subscription.periodEndsAt > now);
    return { deviceId: device.id, hardwareIdentifier: device.hardwareIdentifier, displayName: device.displayName, childId: childId ?? null,
      trialStartsAt: activation.activatedAt.toISOString(), trialEndsAt: activation.trialEndsAt.toISOString(),
      trialDaysRemaining: activation.trialConvertedAt ? 0 : Math.max(0, Math.min(30, (activation.trialEndsAt.getTime() - now.getTime()) / DAY_MS)),
      coverage: coverage?.source ?? "expired", coveredUntil: coverage?.endsAt.toISOString() ?? null,
      graceEndsAt: (grace ?? scheduledGrace)?.endsAt.toISOString() ?? (trial ? new Date(activation.trialEndsAt.getTime() + GRACE_MS).toISOString() : null),
      expiringSoon: !renewing && Boolean((paid ?? trial)?.endsAt && (paid ?? trial)!.endsAt.getTime() - now.getTime() <= 7 * DAY_MS),
      autoRenews: renewing, enforcementEnabled: billingEnforced(organizationId),
    };
  });
}

export async function validateSelection(tx: BillingTransaction, organizationId: string, deviceIds: string[]) {
  if (deviceIds.length < 1 || deviceIds.length > 5 || new Set(deviceIds).size !== deviceIds.length) throw badRequest("Select between one and five different shoes.");
  const owned = await tx.select({ deviceId: deviceOwnerships.deviceId }).from(deviceOwnerships).innerJoin(devices, eq(devices.id, deviceOwnerships.deviceId)).where(and(eq(deviceOwnerships.organizationId, organizationId), isNull(deviceOwnerships.releasedAt), inArray(deviceOwnerships.deviceId, deviceIds), sql`${devices.status} != 'blocked'`));
  if (owned.length !== deviceIds.length) throw forbidden("Every selected shoe must belong to this family and must not be blocked.");
}

export function trialCreditBand(days: number[], shoeCount: number) {
  const equivalentDays = days.reduce((sum, value) => sum + Math.max(0, Math.min(30, value)), 0) / shoeCount;
  return equivalentDays === 0 ? 0 : ([7, 14, 21, 30].find((band) => equivalentDays <= band) ?? 30);
}

export async function createBillingQuote(organizationId: string, userId: string, input: CreateBillingQuoteInput) {
  requirePurchasesEnabled();
  return db.transaction(async (tx) => {
    const customer = await getBillingCustomer(userId, tx);
    await lockBilling(tx, customer.id);
    await lockBilling(tx, organizationId);
    await validateSelection(tx, organizationId, input.deviceIds);
    const subscription = await getFamilySubscription(organizationId, tx);
    const now = new Date();
    const live = subscription && subscription.state !== "revoked" && subscription.graceEndsAt > now ? subscription : null;
    if (live && (live.customerId !== customer.id || live.store !== input.store)) throw new AppError(409, "BILLING_CONFLICT", "Only the original purchaser can change this subscription in its original store.");
    const [otherFamily] = await tx.select().from(familySubscriptions).where(and(eq(familySubscriptions.customerId, customer.id), inArray(familySubscriptions.state, ["active", "billing_issue"])));
    if (otherFamily && otherFamily.organizationId !== organizationId) throw conflict("This purchaser already has a family subscription.");
    const change = !live ? "initial" : input.deviceIds.length > live.shoeCount ? "upgrade" : "deferred";
    const activations = await tx.select().from(deviceActivations).where(inArray(deviceActivations.deviceId, input.deviceIds));
    const remainingTrialDays = Object.fromEntries(activations.map((a) => [a.deviceId, a.trialConvertedAt || live?.deviceIds.includes(a.deviceId) || change === "deferred" ? 0 : Math.max(0, Math.min(30, (a.trialEndsAt.getTime() - now.getTime()) / DAY_MS))]));
    const band = trialCreditBand(Object.values(remainingTrialDays), input.deviceIds.length);
    if (band > 0 && !env.BILLING_EARLY_CREDIT_ENABLED) throw new AppError(409, "EARLY_CHECKOUT_UNAVAILABLE", "Your free trial remains available. Early subscription checkout is not enabled yet.");
    const [catalog] = await tx.select().from(billingCatalog).where(and(eq(billingCatalog.enabled, true), eq(billingCatalog.store, input.store), eq(billingCatalog.environment, env.BILLING_STORE_ENVIRONMENT), eq(billingCatalog.shoeCount, input.deviceIds.length), eq(billingCatalog.termMonths, input.termMonths), eq(billingCatalog.currency, input.currency), eq(billingCatalog.storefront, input.storefront), eq(billingCatalog.trialCreditBand, band))).limit(1);
    if (!catalog || (band > 0 && (!catalog.offerId || catalog.amountMinor > catalog.renewalAmountMinor * (1 - band / (30 * input.termMonths))))) {
      throw new AppError(409, band ? "EARLY_CHECKOUT_UNAVAILABLE" : "BILLING_DISABLED", "The matching store price or eligible offer is not configured. Your existing access is unchanged.");
    }
    if (band && input.store === "APP_STORE") {
      const [code] = await tx.select({ id: billingOfferCodes.id }).from(billingOfferCodes).where(and(eq(billingOfferCodes.catalogId, catalog.id), isNull(billingOfferCodes.issuedAt), gt(billingOfferCodes.expiresAt, now))).limit(1);
      if (!code || !env.BILLING_OFFER_CODE_KEY) throw new AppError(409, "EARLY_CHECKOUT_UNAVAILABLE", "No eligible Apple offer code is available. Your trial is unchanged.");
    }
    const snapshot: BillingQuoteSnapshot = { deviceIds: [...input.deviceIds].sort(), termMonths: input.termMonths, shoeCount: input.deviceIds.length, store: input.store, environment: env.BILLING_STORE_ENVIRONMENT, productId: catalog.productId, basePlanId: catalog.basePlanId, offerId: catalog.offerId, currency: catalog.currency, storefront: catalog.storefront, amountMinor: catalog.amountMinor, renewalAmountMinor: catalog.renewalAmountMinor, trialCreditBand: band, remainingTrialDays, change, subscriptionRevision: live?.revision ?? null };
    const [quote] = await tx.insert(billingQuotes).values({ organizationId, customerId: customer.id, snapshot, expiresAt: new Date(now.getTime() + 15 * 60_000) }).returning();
    return { id: quote.id, customerId: customer.id, ...snapshot, expiresAt: quote.expiresAt.toISOString() };
  });
}

export function encryptOfferCode(code: string) {
  if (!env.BILLING_OFFER_CODE_KEY) throw badRequest("Offer-code encryption key is not configured.");
  const iv = randomBytes(12); const cipher = createCipheriv("aes-256-gcm", Buffer.from(env.BILLING_OFFER_CODE_KEY, "hex"), iv);
  const encrypted = Buffer.concat([cipher.update(code, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString("base64")).join(".");
}

function decryptOfferCode(value: string) {
  if (!env.BILLING_OFFER_CODE_KEY) throw badRequest("Offer-code encryption key is not configured.");
  const [iv, tag, encrypted] = value.split(".").map((part) => Buffer.from(part, "base64"));
  const decipher = createDecipheriv("aes-256-gcm", Buffer.from(env.BILLING_OFFER_CODE_KEY, "hex"), iv); decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}
export const offerCodeHash = (value: string) => createHash("sha256").update(value).digest("hex");

export async function createCheckoutIntent(organizationId: string, userId: string, quoteId: string, idempotencyKey: string) {
  requirePurchasesEnabled();
  return db.transaction(async (tx) => {
    const customer = await getBillingCustomer(userId, tx);
    await lockBilling(tx, customer.id);
    await lockBilling(tx, organizationId);
    const [existing] = await tx.select().from(billingCheckoutIntents).where(and(eq(billingCheckoutIntents.customerId, customer.id), eq(billingCheckoutIntents.idempotencyKey, idempotencyKey)));
    if (existing) {
      if (existing.organizationId !== organizationId || existing.quoteId !== quoteId) throw conflict("Idempotency key was already used for a different checkout.");
      const [code] = await tx.select().from(billingOfferCodes).where(eq(billingOfferCodes.checkoutIntentId, existing.id));
      return { id: existing.id, state: existing.state, customerId: customer.id, ...existing.snapshot, offerCode: code ? decryptOfferCode(code.encryptedCode) : null };
    }
    const [quote] = await tx.select().from(billingQuotes).where(and(eq(billingQuotes.id, quoteId), eq(billingQuotes.organizationId, organizationId), eq(billingQuotes.customerId, customer.id)));
    if (!quote) throw notFound("NOT_FOUND", "Quote not found.");
    if (quote.expiresAt <= new Date()) throw new AppError(409, "BILLING_QUOTE_EXPIRED", "Refresh your subscription quote.");
    await validateSelection(tx, organizationId, quote.snapshot.deviceIds);
    const subscription = await getFamilySubscription(organizationId, tx);
    if (quote.snapshot.subscriptionRevision !== (subscription && subscription.state !== "revoked" && subscription.graceEndsAt > new Date() ? subscription.revision : null)) throw conflict("Subscription changed. Refresh the quote.");
    const [pending] = await tx.select().from(billingCheckoutIntents).where(and(eq(billingCheckoutIntents.organizationId, organizationId), inArray(billingCheckoutIntents.state, ["pending", "needs_review", "deferred"])));
    if (pending) throw conflict("Resolve the previous checkout before starting another.");
    const [intent] = await tx.insert(billingCheckoutIntents).values({ organizationId, customerId: customer.id, quoteId, idempotencyKey, snapshot: quote.snapshot }).returning();
    let offerCode: string | null = null;
    if (quote.snapshot.trialCreditBand && quote.snapshot.store === "APP_STORE") {
      const [catalog] = await tx.select().from(billingCatalog).where(and(eq(billingCatalog.store, quote.snapshot.store), eq(billingCatalog.environment, quote.snapshot.environment), eq(billingCatalog.productId, quote.snapshot.productId), eq(billingCatalog.currency, quote.snapshot.currency), eq(billingCatalog.storefront, quote.snapshot.storefront), eq(billingCatalog.trialCreditBand, quote.snapshot.trialCreditBand), eq(billingCatalog.enabled, true)));
      if (!catalog) throw conflict("Offer is no longer available.");
      const [code] = await tx.select().from(billingOfferCodes).where(and(eq(billingOfferCodes.catalogId, catalog.id), isNull(billingOfferCodes.issuedAt), gt(billingOfferCodes.expiresAt, new Date()))).limit(1).for("update", { skipLocked: true });
      if (!code) throw new AppError(409, "EARLY_CHECKOUT_UNAVAILABLE", "No eligible offer code is available.");
      await tx.update(billingOfferCodes).set({ checkoutIntentId: intent.id, issuedAt: new Date() }).where(eq(billingOfferCodes.id, code.id));
      offerCode = decryptOfferCode(code.encryptedCode);
    }
    return { id: intent.id, state: intent.state, customerId: customer.id, ...intent.snapshot, offerCode };
  });
}

export async function getCheckoutIntent(organizationId: string, id: string) {
  const [intent] = await db.select().from(billingCheckoutIntents).where(and(eq(billingCheckoutIntents.organizationId, organizationId), eq(billingCheckoutIntents.id, id)));
  if (!intent) throw notFound("NOT_FOUND", "Checkout not found.");
  // No offer code, private store identifiers, or purchaser identity in member reads.
  return { id: intent.id, state: intent.state, ...intent.snapshot, createdAt: intent.createdAt.toISOString(), updatedAt: intent.updatedAt.toISOString() };
}

export async function scheduleSelection(organizationId: string, userId: string, deviceIds: string[], revision: number) {
  return db.transaction(async (tx) => {
    const customer = await getBillingCustomer(userId, tx);
    await lockBilling(tx, customer.id);
    await lockBilling(tx, organizationId);
    const subscription = await getFamilySubscription(organizationId, tx);
    if (!subscription || subscription.customerId !== customer.id) throw forbidden("Only the original purchaser can schedule coverage changes.");
    if (subscription.revision !== revision) throw conflict("Subscription changed. Refresh and retry.");
    if (subscription.state !== "active" || !subscription.autoRenews || subscription.periodEndsAt <= new Date()) throw conflict("Coverage selection requires an actively renewing subscription.");
    if (deviceIds.length !== subscription.shoeCount) throw badRequest("Count or term changes require a store checkout. This endpoint only substitutes shoes.");
    await validateSelection(tx, organizationId, deviceIds);
    const [pending] = await tx.select().from(billingCheckoutIntents).where(and(eq(billingCheckoutIntents.organizationId, organizationId), inArray(billingCheckoutIntents.state, ["pending", "needs_review", "deferred"])));
    if (pending) throw conflict("Resolve the pending checkout first.");
    await tx.update(familySubscriptions).set({ nextDeviceIds: [...deviceIds].sort(), revision: revision + 1 }).where(eq(familySubscriptions.id, subscription.id));
    return { effectiveAt: subscription.periodEndsAt.toISOString(), revision: revision + 1 };
  });
}

export async function purchaserSubscriptions(userId: string) {
  const customer = await getBillingCustomer(userId);
  const subscriptions = await db.select().from(familySubscriptions).where(eq(familySubscriptions.customerId, customer.id));
  return { customerId: customer.id, subscriptions: subscriptions.map((s) => ({ id: s.id, organizationId: s.organizationId, store: s.store, state: s.state, autoRenews: s.autoRenews, periodEndsAt: s.periodEndsAt.toISOString(), managementUrl: s.store === "APP_STORE" ? "https://apps.apple.com/account/subscriptions" : `https://play.google.com/store/account/subscriptions?package=com.stepwhere&sku=${encodeURIComponent(s.productId)}` })) };
}
