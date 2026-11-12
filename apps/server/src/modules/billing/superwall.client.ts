import { z } from "zod";
import { env } from "../../config/env";
import { AppError } from "../../shared/errors";
import { GRACE_MS } from "./billing-ownership.service";

const date = z.string().datetime({ offset: true });
const subscriberSchema = z.object({ subscriber: z.object({
  original_app_user_id: z.string(),
  subscriptions: z.record(z.string(), z.object({
    expires_date: date.nullable(), purchase_date: date.nullable(),
    grace_period_expires_date: date.nullable(), billing_issues_detected_at: date.nullable(),
    is_sandbox: z.boolean(), ownership_type: z.enum(["PURCHASED", "FAMILY_SHARED"]),
    product_plan_identifier: z.string().nullable(), refunded_at: date.nullable(),
    store: z.string(), store_transaction_id: z.string(), unsubscribe_detected_at: date.nullable(),
  })),
}) });
const historySchema = z.object({ app_user_id: z.string(), data: z.array(z.object({
  subscription_id: z.string(), product_id: z.string(), product_type: z.string(), store: z.string(), transaction_id: z.string(),
  state: z.enum(["active", "inGracePeriod", "expired", "inBillingRetryPeriod", "revoked"]), will_renew: z.boolean(),
  renewed_at: date.nullable(), starts_at: date.nullable(), expires_at: date.nullable(),
})) });

export type VerifiedSubscription = {
  providerSubscriptionId: string; productId: string; basePlanId: string | null; transactionId: string;
  store: "APP_STORE" | "PLAY_STORE"; environment: "SANDBOX" | "PRODUCTION";
  state: "active" | "billing_issue" | "expired" | "revoked"; autoRenews: boolean;
  purchasedAt: Date; expiresAt: Date; graceEndsAt: Date;
  verifiedAt: Date;
};

async function providerGet(path: string) {
  if (!env.SUPERWALL_API_KEY || !env.SUPERWALL_PROJECT_ID || !env.SUPERWALL_APPLICATION_IDS.length) throw new AppError(503, "BILLING_DISABLED", "Superwall server credentials are not configured.");
  const response = await fetch(`https://api.superwall.com${path}`, { headers: { Authorization: `Bearer ${env.SUPERWALL_API_KEY}`, Accept: "application/json" }, signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new AppError(503, "SERVICE_UNAVAILABLE", "Subscription verification is temporarily unavailable.");
  // Never log bodies, receipts, tokens, aliases, or provider errors.
  return response.json() as Promise<unknown>;
}

export async function fetchVerifiedSubscriptions(customerId: string): Promise<VerifiedSubscription[]> {
  const verifiedAt = new Date();
  const [subscriberBody, ...historyBodies] = await Promise.all([
    providerGet(`/revenuecat/v1/projects/${encodeURIComponent(env.SUPERWALL_PROJECT_ID ?? "")}/subscribers/${encodeURIComponent(customerId)}`),
    ...env.SUPERWALL_APPLICATION_IDS.map((id) => providerGet(`/v3/users/${encodeURIComponent(customerId)}/subscriptions?application_id=${encodeURIComponent(id)}`)),
  ]);
  const parsed = subscriberSchema.safeParse(subscriberBody);
  const histories = historyBodies.map((body) => historySchema.safeParse(body));
  if (!parsed.success || histories.some((h) => !h.success)) throw new AppError(503, "SERVICE_UNAVAILABLE", "The subscription provider response could not be verified.");
  if (parsed.data.subscriber.original_app_user_id !== customerId || histories.some((h) => h.success && h.data.app_user_id !== customerId)) throw new AppError(409, "BILLING_CONFLICT", "This store purchase is associated with another billing identity. Contact support.");
  const records = new Map<string, VerifiedSubscription>();
  for (const history of histories) {
    if (!history.success) continue;
    for (const item of history.data.data) {
      const store = item.store.toUpperCase();
      if (store !== "APP_STORE" && store !== "PLAY_STORE") continue;
      if (item.product_type !== "autorenewable" || !item.expires_at || !(item.renewed_at ?? item.starts_at)) continue;
      const current = Object.entries(parsed.data.subscriber.subscriptions).find(([productId, sub]) => productId === item.product_id && sub.store_transaction_id === item.transaction_id)?.[1];
      if (!current || current.ownership_type !== "PURCHASED" || !current.expires_date || !current.purchase_date) continue;
      if ((current.is_sandbox ? "SANDBOX" : "PRODUCTION") !== env.BILLING_STORE_ENVIRONMENT) continue;
      const expiresAt = new Date(current.expires_date);
      if (expiresAt <= new Date(current.purchase_date)) continue;
      const billingIssue = Boolean(current.billing_issues_detected_at || item.state === "inGracePeriod" || item.state === "inBillingRetryPeriod");
      // Failed payment gets ONLY store-confirmed grace, capped at three days.
      const graceEndsAt = billingIssue
        ? new Date(Math.max(expiresAt.getTime(), Math.min(current.grace_period_expires_date ? Date.parse(current.grace_period_expires_date) : expiresAt.getTime(), expiresAt.getTime() + GRACE_MS)))
        : new Date(expiresAt.getTime() + GRACE_MS);
      const state = current.refunded_at || item.state === "revoked" ? "revoked" : billingIssue ? "billing_issue" : expiresAt <= new Date() ? "expired" : "active";
      records.set(`${store}:${item.subscription_id}`, { providerSubscriptionId: item.subscription_id, productId: item.product_id, basePlanId: current.product_plan_identifier, transactionId: item.transaction_id, store, environment: env.BILLING_STORE_ENVIRONMENT, state, autoRenews: item.will_renew && !current.unsubscribe_detected_at, purchasedAt: new Date(current.purchase_date), expiresAt, graceEndsAt: state === "revoked" ? expiresAt : graceEndsAt, verifiedAt });
    }
  }
  return [...records.values()];
}
