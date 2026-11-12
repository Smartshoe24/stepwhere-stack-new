import { and, eq, gt, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import { env } from "../../config/env";
import { db } from "../../db/client";
import { billingCustomers, billingProviderEvents, billingTransactions, children, childShareLinks, familySubscriptions } from "../../db/schema";
import { AppError } from "../../shared/errors";
import { childHasCoverage } from "./billing-coverage.service";
import { reconcileBillingCustomer } from "./billing-verification.service";
import { publicShareRealtimeRegistry } from "../shares/share-realtime.service";

export const superwallEventSchema = z.object({
  object: z.literal("event"), type: z.string(), projectId: z.union([z.string(), z.number()]), applicationId: z.union([z.string(), z.number()]),
  data: z.object({ id: z.string(), originalAppUserId: z.string().nullable(), store: z.enum(["APP_STORE", "PLAY_STORE", "STRIPE"]),
    environment: z.enum(["SANDBOX", "PRODUCTION"]), transactionId: z.string(), originalTransactionId: z.string(), productId: z.string(),
    offerCode: z.string().nullable().optional(), currencyCode: z.string().optional(), priceInPurchasedCurrency: z.number().optional(),
    price: z.number().optional(), purchasedAt: z.number(), isFamilyShare: z.boolean().optional(),
  }).passthrough(),
}).passthrough();

export async function processBillingEvents(limit = 20) {
  if (!env.SUPERWALL_API_KEY) return;
  for (let index = 0; index < limit; index++) {
    const event = await db.transaction(async (tx) => {
      const [row] = await tx.select().from(billingProviderEvents).where(and(lte(billingProviderEvents.availableAt, new Date()), or(eq(billingProviderEvents.state, "pending"), and(eq(billingProviderEvents.state, "processing"), lte(billingProviderEvents.leaseUntil, new Date()))))).orderBy(billingProviderEvents.receivedAt).limit(1).for("update", { skipLocked: true });
      if (!row) return null;
      await tx.update(billingProviderEvents).set({ state: "processing", attempts: row.attempts + 1, leaseUntil: new Date(Date.now() + 120_000) }).where(eq(billingProviderEvents.id, row.id));
      return row;
    });
    if (!event) break;
    try {
      const parsed = superwallEventSchema.safeParse(event.payload);
      if (!parsed.success) throw new AppError(409, "BILLING_CONFLICT", "Unsupported webhook schema.");
      const data = parsed.data.data;
      if (String(parsed.data.projectId) !== env.SUPERWALL_PROJECT_ID || !env.SUPERWALL_APPLICATION_IDS.includes(String(parsed.data.applicationId)) || data.environment !== env.BILLING_STORE_ENVIRONMENT || data.store === "STRIPE" || data.isFamilyShare) {
        await db.update(billingProviderEvents).set({ state: "needs_review", leaseUntil: null, lastError: "project_application_store_or_environment_mismatch" }).where(eq(billingProviderEvents.id, event.id));
        continue;
      }
      let customerId: string | null = null;
      if (data.originalAppUserId && z.string().uuid().safeParse(data.originalAppUserId).success) {
        const [customer] = await db.select().from(billingCustomers).where(eq(billingCustomers.id, data.originalAppUserId));
        customerId = customer?.id ?? null;
      }
      if (!customerId) {
        const [transaction] = await db.select().from(billingTransactions).where(and(eq(billingTransactions.store, data.store), eq(billingTransactions.environment, data.environment), eq(billingTransactions.transactionId, data.transactionId)));
        customerId = transaction?.customerId ?? null;
      }
      if (!customerId) throw new AppError(409, "BILLING_CONFLICT", "Unresolved billing identity.");
      const refunded = (data.price ?? 0) < 0 || (data.priceInPurchasedCurrency ?? 0) < 0;
      if (data.currencyCode && (data.priceInPurchasedCurrency ?? 0) > 0 && ["initial_purchase", "renewal"].includes(parsed.data.type)) {
        const currencyDigits = new Intl.NumberFormat("en", { style: "currency", currency: data.currencyCode }).resolvedOptions().maximumFractionDigits ?? 2;
        await db.update(billingTransactions).set({ currency: data.currencyCode, amountMinor: Math.round(data.priceInPurchasedCurrency! * 10 ** currencyDigits) }).where(and(eq(billingTransactions.store, data.store), eq(billingTransactions.environment, data.environment), eq(billingTransactions.transactionId, data.transactionId)));
      }
      if (refunded) {
        // Refunds must revoke the affected grant even if this is an old period no
        // longer returned by the provider's current-subscriber view.
        await db.transaction(async (tx) => {
          const [transaction] = await tx.update(billingTransactions).set({ status: "revoked" }).where(and(eq(billingTransactions.store, data.store), eq(billingTransactions.environment, data.environment), eq(billingTransactions.transactionId, data.transactionId))).returning();
          if (transaction) {
            await tx.execute(sql`update device_coverage_intervals set revoked_at = now() where grant_key = ${transaction.id}`);
            if (transaction.subscriptionId) await tx.update(familySubscriptions).set({ state: "revoked", autoRenews: false, graceEndsAt: new Date(), lastVerifiedAt: new Date() }).where(and(eq(familySubscriptions.id, transaction.subscriptionId), eq(familySubscriptions.periodStartsAt, transaction.purchasedAt)));
          }
        });
      }
      const paymentEvent = ["initial_purchase", "renewal"].includes(parsed.data.type) && (data.priceInPurchasedCurrency ?? 0) > 0;
      await reconcileBillingCustomer(customerId, paymentEvent ? { transactionId: data.transactionId, productId: data.productId, offerCode: data.offerCode ?? null, currency: data.currencyCode ?? "", amount: data.priceInPurchasedCurrency ?? 0, refunded, purchasedAt: new Date(data.purchasedAt) } : undefined);
      // Reconciliation may have created the ledger row for the first time.
      if (paymentEvent && data.currencyCode) {
        const currencyDigits = new Intl.NumberFormat("en", { style: "currency", currency: data.currencyCode }).resolvedOptions().maximumFractionDigits ?? 2;
        await db.update(billingTransactions).set({ currency: data.currencyCode, amountMinor: Math.round(data.priceInPurchasedCurrency! * 10 ** currencyDigits) }).where(and(eq(billingTransactions.store, data.store), eq(billingTransactions.environment, data.environment), eq(billingTransactions.transactionId, data.transactionId)));
      }
      await db.update(billingProviderEvents).set({ state: "completed", leaseUntil: null, lastError: null }).where(eq(billingProviderEvents.id, event.id));
    } catch (error) {
      const review = error instanceof AppError && error.status === 409 || event.attempts >= 9;
      await db.update(billingProviderEvents).set({ state: review ? "needs_review" : "pending", leaseUntil: null, availableAt: new Date(Date.now() + Math.min(3_600_000, 30_000 * 2 ** event.attempts)), lastError: error instanceof AppError ? error.code : "provider_reconciliation_failed" }).where(eq(billingProviderEvents.id, event.id));
    }
  }
}

export async function maintainBillingCoverage() {
  await db.update(familySubscriptions).set({ state: "expired" }).where(and(inArray(familySubscriptions.state, ["active", "billing_issue"]), lte(familySubscriptions.graceEndsAt, new Date())));
  const shares = await db.select({ share: childShareLinks, organizationId: children.organizationId }).from(childShareLinks).innerJoin(children, eq(children.id, childShareLinks.childId)).where(and(eq(childShareLinks.status, "active"), gt(childShareLinks.expiresAt, new Date())));
  for (const { share, organizationId } of shares) {
    if (await childHasCoverage(organizationId, share.childId)) continue;
    await db.update(childShareLinks).set({ status: "revoked", revokedAt: new Date(), updatedAt: new Date() }).where(eq(childShareLinks.id, share.id));
    await publicShareRealtimeRegistry.endShare(share.id, "stopped");
  }
  // Signed raw payloads are operational records, not the financial ledger.
  await db.delete(billingProviderEvents).where(and(eq(billingProviderEvents.state, "completed"), lte(billingProviderEvents.receivedAt, new Date(Date.now() - 30 * 86_400_000))));
}

export async function reconcileDueSubscriptions(limit = 10) {
  if (!env.SUPERWALL_API_KEY) return;
  const subscriptions = await db.select().from(familySubscriptions).where(and(inArray(familySubscriptions.state, ["active", "billing_issue"]), lte(familySubscriptions.lastVerifiedAt, new Date(Date.now() - 15 * 60_000)))).orderBy(familySubscriptions.lastVerifiedAt).limit(limit);
  for (const customerId of new Set(subscriptions.map((s) => s.customerId))) {
    try { await reconcileBillingCustomer(customerId); }
    catch { /* Keep the last verified dates; a provider outage never extends access. */ }
  }
}
