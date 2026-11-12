import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "../../db/client";
import { billingCatalog, billingCheckoutIntents, billingOfferCodes, billingTransactions, billingTrialCredits, deviceActivations, deviceCoverageIntervals, familySubscriptions } from "../../db/schema";
import { conflict } from "../../shared/errors";
import { fetchVerifiedSubscriptions, type VerifiedSubscription } from "./superwall.client";
import { getBillingCustomer, lockBilling, offerCodeHash, validateSelection } from "./billing.service";

// Only signed, project/application/environment-checked webhooks provide these hints.
export type VerifiedEventHint = { transactionId: string; productId: string; offerCode: string | null; currency: string; amount: number; refunded: boolean; purchasedAt: Date };

export async function reconcileBillingCustomer(customerId: string, hint?: VerifiedEventHint) {
  const subscriptions = await fetchVerifiedSubscriptions(customerId);
  let applied = 0;
  for (const subscription of subscriptions) if (await applyVerifiedSubscription(customerId, subscription, hint)) applied++;
  return { verifiedSubscriptions: subscriptions.length, applied };
}

export async function syncPurchaser(userId: string) {
  const customer = await getBillingCustomer(userId);
  return reconcileBillingCustomer(customer.id);
}

async function applyVerifiedSubscription(customerId: string, verified: VerifiedSubscription, hint?: VerifiedEventHint) {
  return db.transaction(async (tx) => {
    await lockBilling(tx, customerId);
    const [existing] = await tx.select().from(familySubscriptions).where(and(eq(familySubscriptions.store, verified.store), eq(familySubscriptions.environment, verified.environment), eq(familySubscriptions.originalTransactionId, verified.providerSubscriptionId)));
    if (existing && existing.customerId !== customerId) throw conflict("The store subscription already belongs to another purchaser.");
    if (existing && existing.lastVerifiedAt > verified.verifiedAt) return false;
    const pending = await tx.select().from(billingCheckoutIntents).where(and(eq(billingCheckoutIntents.customerId, customerId), inArray(billingCheckoutIntents.state, ["pending", "deferred", "needs_review", "abandoned"]))).orderBy(billingCheckoutIntents.createdAt);
    // No client attribute or current UI selection can choose a family or shoes.
    const candidates = pending.filter((i) => i.snapshot.productId === verified.productId && i.snapshot.basePlanId === verified.basePlanId && i.snapshot.store === verified.store && i.snapshot.environment === verified.environment && i.createdAt.getTime() <= verified.purchasedAt.getTime() + 1_000);
    let intent = candidates.length === 1 ? candidates[0] : undefined;
    if (candidates.length > 1 && hint?.offerCode && verified.store === "APP_STORE") {
      // Issued codes remain tied to abandoned intents. A delayed redemption can
      // still resolve the original selection rather than the newest screen.
      const [code] = await tx.select().from(billingOfferCodes).where(eq(billingOfferCodes.codeHash, offerCodeHash(hint.offerCode)));
      intent = candidates.find((candidate) => candidate.id === code?.checkoutIntentId);
    }
    const organizationId = existing?.organizationId ?? intent?.organizationId;
    const [ledger] = await tx.insert(billingTransactions).values({ store: verified.store, environment: verified.environment, transactionId: verified.transactionId, originalTransactionId: verified.providerSubscriptionId, customerId, productId: verified.productId, purchasedAt: verified.purchasedAt, expiresAt: verified.expiresAt, status: "unassigned" }).onConflictDoNothing().returning();
    const transaction = ledger ?? (await tx.select().from(billingTransactions).where(and(eq(billingTransactions.store, verified.store), eq(billingTransactions.environment, verified.environment), eq(billingTransactions.transactionId, verified.transactionId))))[0];
    if (transaction.customerId !== customerId || transaction.status === "revoked") return false;
    if (!organizationId || (!existing && !intent)) return false;
    // All billing mutations use purchaser -> family lock ordering.
    await lockBilling(tx, organizationId);
    if (existing && verified.purchasedAt < existing.periodStartsAt) return false;
    const signedOffer = hint?.transactionId === verified.transactionId && hint.productId === verified.productId && !hint.refunded ? hint : undefined;
    if (intent?.snapshot.trialCreditBand) {
      let matchingOffer = Boolean(signedOffer && signedOffer.offerCode === intent.snapshot.offerId);
      if (signedOffer?.offerCode && verified.store === "APP_STORE") {
        const [code] = await tx.select().from(billingOfferCodes).where(and(eq(billingOfferCodes.checkoutIntentId, intent.id), eq(billingOfferCodes.codeHash, offerCodeHash(signedOffer.offerCode))));
        matchingOffer = Boolean(code);
      }
      const currencyDigits = new Intl.NumberFormat("en", { style: "currency", currency: intent.snapshot.currency }).resolvedOptions().maximumFractionDigits ?? 2;
      const amountMatches = Boolean(signedOffer && signedOffer.currency === intent.snapshot.currency && Math.round(signedOffer.amount * 10 ** currencyDigits) <= intent.snapshot.amountMinor);
      if (!matchingOffer || !amountMatches) {
        await tx.update(billingCheckoutIntents).set({ state: "needs_review", updatedAt: new Date() }).where(eq(billingCheckoutIntents.id, intent.id));
        // Preserve the free trial; never consume its credit for an unverified offer.
        return false;
      }
    }
    // Existing purchased transaction is not a new purchase for a new quote.
    if (transaction.status === "verified" && transaction.checkoutIntentId !== intent?.id) intent = undefined;
    const [catalog] = await tx.select().from(billingCatalog).where(and(eq(billingCatalog.store, verified.store), eq(billingCatalog.environment, verified.environment), eq(billingCatalog.productId, verified.productId), eq(billingCatalog.trialCreditBand, 0), sql`${billingCatalog.basePlanId} is not distinct from ${verified.basePlanId}`)).limit(1);
    if (!catalog) return false;
    if (existing && !intent && (existing.shoeCount !== catalog.shoeCount || existing.termMonths !== catalog.termMonths)) return false;
    if (intent?.snapshot.change === "deferred" && existing && verified.purchasedAt < existing.periodEndsAt) {
      await tx.update(billingCheckoutIntents).set({ state: "deferred", updatedAt: new Date() }).where(eq(billingCheckoutIntents.id, intent.id));
      return false;
    }
    const isNewPeriod = !existing || verified.purchasedAt >= existing.periodEndsAt;
    const deviceIds = intent?.snapshot.deviceIds ?? (isNewPeriod ? existing?.nextDeviceIds ?? existing?.deviceIds : existing?.deviceIds);
    if (!deviceIds || deviceIds.length !== catalog.shoeCount) return false;
    await validateSelection(tx, organizationId, deviceIds);
    const [other] = await tx.select().from(familySubscriptions).where(and(eq(familySubscriptions.organizationId, organizationId), inArray(familySubscriptions.state, ["active", "billing_issue"])));
    if (other && other.id !== existing?.id) {
      if (other.customerId !== customerId || other.store !== verified.store || other.graceEndsAt > new Date()) return false;
      await tx.update(familySubscriptions).set({ state: "expired" }).where(eq(familySubscriptions.id, other.id));
    }
    const nextDeviceIds = isNewPeriod || intent ? null : existing?.nextDeviceIds ?? null;
    const changed = !existing || existing.productId !== verified.productId || existing.state !== verified.state || existing.autoRenews !== verified.autoRenews || existing.periodStartsAt.getTime() !== verified.purchasedAt.getTime() || existing.periodEndsAt.getTime() !== verified.expiresAt.getTime() || existing.graceEndsAt.getTime() !== verified.graceEndsAt.getTime() || JSON.stringify(existing.deviceIds) !== JSON.stringify(deviceIds) || JSON.stringify(existing.nextDeviceIds) !== JSON.stringify(nextDeviceIds);
    const values = { organizationId, customerId, store: verified.store, environment: verified.environment, originalTransactionId: verified.providerSubscriptionId, productId: verified.productId, shoeCount: catalog.shoeCount, termMonths: catalog.termMonths, deviceIds, nextDeviceIds, state: verified.state, autoRenews: verified.autoRenews, periodStartsAt: verified.purchasedAt, periodEndsAt: verified.expiresAt, graceEndsAt: verified.graceEndsAt, lastVerifiedAt: verified.verifiedAt, revision: (existing?.revision ?? 0) + (changed ? 1 : 0) };
    const [subscription] = existing ? await tx.update(familySubscriptions).set(values).where(eq(familySubscriptions.id, existing.id)).returning() : await tx.insert(familySubscriptions).values(values).returning();
    const revoked = verified.state === "revoked";
    await tx.update(billingTransactions).set({ subscriptionId: subscription.id, checkoutIntentId: intent?.id ?? transaction.checkoutIntentId, status: revoked ? "revoked" : "verified", offerId: signedOffer?.offerCode ?? transaction.offerId }).where(eq(billingTransactions.id, transaction.id));
    if (revoked) {
      await tx.update(deviceCoverageIntervals).set({ revokedAt: new Date() }).where(eq(deviceCoverageIntervals.grantKey, transaction.id));
      return true;
    }
    if (intent && existing && verified.purchasedAt < existing.periodEndsAt) {
      // Upgrades replace the previous bundle immediately; old coverage must not
      // continue for shoes omitted from the verified new bundle.
      await tx.update(deviceCoverageIntervals).set({ endsAt: verified.purchasedAt }).where(and(eq(deviceCoverageIntervals.subscriptionId, existing.id), sql`${deviceCoverageIntervals.startsAt} < ${verified.purchasedAt.toISOString()}::timestamptz`, sql`${deviceCoverageIntervals.endsAt} > ${verified.purchasedAt.toISOString()}::timestamptz`));
      await tx.update(deviceCoverageIntervals).set({ revokedAt: verified.purchasedAt }).where(and(eq(deviceCoverageIntervals.subscriptionId, existing.id), sql`${deviceCoverageIntervals.startsAt} >= ${verified.purchasedAt.toISOString()}::timestamptz`));
    }
    for (const deviceId of deviceIds) {
      await tx.insert(deviceCoverageIntervals).values({ deviceId, organizationId, subscriptionId: subscription.id, grantKey: transaction.id, source: "paid", startsAt: verified.purchasedAt, endsAt: verified.expiresAt }).onConflictDoUpdate({ target: [deviceCoverageIntervals.deviceId, deviceCoverageIntervals.grantKey, deviceCoverageIntervals.source], set: { endsAt: verified.expiresAt } });
      await tx.insert(deviceCoverageIntervals).values({ deviceId, organizationId, subscriptionId: subscription.id, grantKey: transaction.id, source: "grace", startsAt: verified.expiresAt, endsAt: verified.graceEndsAt }).onConflictDoUpdate({ target: [deviceCoverageIntervals.deviceId, deviceCoverageIntervals.grantKey, deviceCoverageIntervals.source], set: { startsAt: verified.expiresAt, endsAt: verified.graceEndsAt } });
      if (intent?.snapshot.trialCreditBand && (intent.snapshot.remainingTrialDays[deviceId] ?? 0) > 0) {
        const [consumed] = await tx.insert(billingTrialCredits).values({ deviceId, transactionId: transaction.id, remainingDays: String(intent.snapshot.remainingTrialDays[deviceId]), band: intent.snapshot.trialCreditBand }).onConflictDoNothing().returning();
        if (consumed) {
          await tx.update(deviceActivations).set({ trialConvertedAt: verified.purchasedAt }).where(eq(deviceActivations.deviceId, deviceId));
          await tx.update(deviceCoverageIntervals).set({ endsAt: verified.purchasedAt }).where(and(eq(deviceCoverageIntervals.deviceId, deviceId), eq(deviceCoverageIntervals.source, "trial"), sql`${deviceCoverageIntervals.startsAt} <= ${verified.purchasedAt.toISOString()}::timestamptz`, sql`${deviceCoverageIntervals.endsAt} > ${verified.purchasedAt.toISOString()}::timestamptz`));
          await tx.update(deviceCoverageIntervals).set({ revokedAt: verified.purchasedAt }).where(and(eq(deviceCoverageIntervals.deviceId, deviceId), eq(deviceCoverageIntervals.grantKey, `trial:${deviceId}`), eq(deviceCoverageIntervals.source, "grace")));
        }
      }
    }
    if (intent) {
      await tx.update(billingCheckoutIntents).set({ state: "completed", updatedAt: new Date() }).where(eq(billingCheckoutIntents.id, intent.id));
      await tx.update(billingOfferCodes).set({ redeemedAt: new Date() }).where(eq(billingOfferCodes.checkoutIntentId, intent.id));
    }
    return true;
  });
}
