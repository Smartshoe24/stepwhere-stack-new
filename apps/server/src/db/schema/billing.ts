import { sql } from "drizzle-orm";
import { boolean, check, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { devices } from "./core";
import { organizations } from "./family";

const instant = (name: string) => timestamp(name, { withTimezone: true });

// Neither unlinking a child nor deleting an account resets a physical shoe's trial.
export const deviceActivations = pgTable("device_activations", {
  deviceId: uuid("device_id").primaryKey().references(() => devices.id, { onDelete: "restrict" }),
  activatedAt: instant("activated_at").notNull(),
  trialEndsAt: instant("trial_ends_at").notNull(),
  trialConvertedAt: instant("trial_converted_at"),
  replacementOfDeviceId: uuid("replacement_of_device_id").references(() => devices.id, { onDelete: "restrict" }),
});

export const deviceOwnerships = pgTable("device_ownerships", {
  id: uuid("id").defaultRandom().primaryKey(),
  deviceId: uuid("device_id").notNull().references(() => devices.id, { onDelete: "restrict" }),
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "set null" }),
  claimedByUserId: uuid("claimed_by_user_id").references(() => users.id, { onDelete: "set null" }),
  claimedAt: instant("claimed_at").notNull().defaultNow(),
  releasedAt: instant("released_at"),
  releaseReason: text("release_reason"),
}, (t) => [uniqueIndex("device_ownerships_active_unique").on(t.deviceId).where(sql`${t.releasedAt} is null and ${t.organizationId} is not null`), index("device_ownerships_family_idx").on(t.organizationId)]);

export const billingCustomers = pgTable("billing_customers", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: instant("created_at").notNull().defaultNow(),
}, (t) => [uniqueIndex("billing_customers_user_unique").on(t.userId)]);

export type BillingQuoteSnapshot = {
  deviceIds: string[]; termMonths: 3 | 6 | 12; shoeCount: number;
  store: "APP_STORE" | "PLAY_STORE"; environment: "SANDBOX" | "PRODUCTION";
  productId: string; basePlanId: string | null; offerId: string | null;
  currency: string; storefront: string; amountMinor: number; renewalAmountMinor: number;
  trialCreditBand: number; remainingTrialDays: Record<string, number>;
  change: "initial" | "upgrade" | "deferred"; subscriptionRevision: number | null;
};

// Prices must be imported from the stores; no guessed prices or custom IAP amounts.
export const billingCatalog = pgTable("billing_catalog", {
  id: uuid("id").defaultRandom().primaryKey(),
  store: text("store").$type<BillingQuoteSnapshot["store"]>().notNull(),
  environment: text("environment").$type<BillingQuoteSnapshot["environment"]>().notNull(),
  shoeCount: integer("shoe_count").notNull(), termMonths: integer("term_months").notNull(),
  productId: text("product_id").notNull(), basePlanId: text("base_plan_id"), offerId: text("offer_id"),
  currency: text("currency").notNull(), storefront: text("storefront").notNull(),
  trialCreditBand: integer("trial_credit_band").notNull().default(0),
  amountMinor: integer("amount_minor").notNull(), renewalAmountMinor: integer("renewal_amount_minor").notNull(),
  enabled: boolean("enabled").notNull().default(false),
  updatedAt: instant("updated_at").notNull().defaultNow(),
}, (t) => [
  uniqueIndex("billing_catalog_variant_unique").on(t.store, t.environment, t.shoeCount, t.termMonths, t.currency, t.storefront, t.trialCreditBand),
  check("billing_catalog_dimensions", sql`${t.shoeCount} between 1 and 5 and ${t.termMonths} in (3,6,12) and ${t.trialCreditBand} in (0,7,14,21,30) and ${t.amountMinor} >= 0 and ${t.renewalAmountMinor} > 0`),
]);

export const familySubscriptions = pgTable("family_subscriptions", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "set null" }),
  customerId: uuid("customer_id").notNull().references(() => billingCustomers.id, { onDelete: "restrict" }),
  store: text("store").$type<BillingQuoteSnapshot["store"]>().notNull(),
  environment: text("environment").$type<BillingQuoteSnapshot["environment"]>().notNull(),
  originalTransactionId: text("original_transaction_id").notNull(),
  productId: text("product_id").notNull(),
  shoeCount: integer("shoe_count").notNull(), termMonths: integer("term_months").notNull(),
  deviceIds: jsonb("device_ids").$type<string[]>().notNull(),
  nextDeviceIds: jsonb("next_device_ids").$type<string[] | null>(),
  state: text("state").$type<"active" | "billing_issue" | "expired" | "revoked">().notNull(),
  autoRenews: boolean("auto_renews").notNull(),
  periodStartsAt: instant("period_starts_at").notNull(), periodEndsAt: instant("period_ends_at").notNull(),
  graceEndsAt: instant("grace_ends_at").notNull(),
  revision: integer("revision").notNull().default(1),
  lastVerifiedAt: instant("last_verified_at").notNull(),
}, (t) => [
  uniqueIndex("family_subscriptions_provider_unique").on(t.store, t.environment, t.originalTransactionId),
  uniqueIndex("family_subscriptions_family_live_unique").on(t.organizationId).where(sql`${t.state} in ('active','billing_issue')`),
  uniqueIndex("family_subscriptions_purchaser_live_unique").on(t.customerId).where(sql`${t.state} in ('active','billing_issue')`),
]);

export const billingQuotes = pgTable("billing_quotes", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  customerId: uuid("customer_id").notNull().references(() => billingCustomers.id, { onDelete: "restrict" }),
  snapshot: jsonb("snapshot").$type<BillingQuoteSnapshot>().notNull(),
  createdAt: instant("created_at").notNull().defaultNow(), expiresAt: instant("expires_at").notNull(),
});

export const billingCheckoutIntents = pgTable("billing_checkout_intents", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "set null" }),
  customerId: uuid("customer_id").notNull().references(() => billingCustomers.id, { onDelete: "restrict" }),
  quoteId: uuid("quote_id").references(() => billingQuotes.id, { onDelete: "set null" }),
  snapshot: jsonb("snapshot").$type<BillingQuoteSnapshot>().notNull(),
  idempotencyKey: uuid("idempotency_key").notNull(),
  state: text("state").$type<"pending" | "completed" | "deferred" | "abandoned" | "needs_review">().notNull().default("pending"),
  createdAt: instant("created_at").notNull().defaultNow(), updatedAt: instant("updated_at").notNull().defaultNow(),
}, (t) => [
  uniqueIndex("billing_checkout_idempotency_unique").on(t.customerId, t.idempotencyKey),
  uniqueIndex("billing_checkout_family_pending_unique").on(t.organizationId).where(sql`${t.state} in ('pending','needs_review','deferred')`),
]);

export const billingTransactions = pgTable("billing_transactions", {
  id: uuid("id").defaultRandom().primaryKey(),
  store: text("store").notNull(), environment: text("environment").notNull(),
  transactionId: text("transaction_id").notNull(), originalTransactionId: text("original_transaction_id").notNull(),
  customerId: uuid("customer_id").references(() => billingCustomers.id, { onDelete: "restrict" }),
  subscriptionId: uuid("subscription_id").references(() => familySubscriptions.id, { onDelete: "restrict" }),
  checkoutIntentId: uuid("checkout_intent_id").references(() => billingCheckoutIntents.id, { onDelete: "restrict" }),
  productId: text("product_id").notNull(), purchasedAt: instant("purchased_at").notNull(), expiresAt: instant("expires_at").notNull(),
  offerId: text("offer_id"), status: text("status").$type<"verified" | "unassigned" | "revoked">().notNull(),
  currency: text("currency"), amountMinor: integer("amount_minor"),
  createdAt: instant("created_at").notNull().defaultNow(),
}, (t) => [uniqueIndex("billing_transactions_provider_unique").on(t.store, t.environment, t.transactionId)]);

export const deviceCoverageIntervals = pgTable("device_coverage_intervals", {
  id: uuid("id").defaultRandom().primaryKey(),
  deviceId: uuid("device_id").notNull().references(() => devices.id, { onDelete: "restrict" }),
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "set null" }),
  subscriptionId: uuid("subscription_id").references(() => familySubscriptions.id, { onDelete: "restrict" }),
  grantKey: text("grant_key").notNull(),
  source: text("source").$type<"trial" | "paid" | "grace" | "legacy" | "support">().notNull(),
  startsAt: instant("starts_at").notNull(), endsAt: instant("ends_at").notNull(), revokedAt: instant("revoked_at"),
}, (t) => [uniqueIndex("device_coverage_grant_unique").on(t.deviceId, t.grantKey, t.source), index("device_coverage_lookup_idx").on(t.deviceId, t.startsAt, t.endsAt), check("device_coverage_order", sql`${t.endsAt} >= ${t.startsAt}`)]);

export const billingTrialCredits = pgTable("billing_trial_credits", {
  deviceId: uuid("device_id").primaryKey().references(() => deviceActivations.deviceId, { onDelete: "restrict" }),
  transactionId: uuid("transaction_id").notNull().references(() => billingTransactions.id, { onDelete: "restrict" }),
  remainingDays: text("remaining_days").notNull(), band: integer("band").notNull(),
  consumedAt: instant("consumed_at").notNull().defaultNow(),
});

export const billingOfferCodes = pgTable("billing_offer_codes", {
  id: uuid("id").defaultRandom().primaryKey(), catalogId: uuid("catalog_id").notNull().references(() => billingCatalog.id, { onDelete: "restrict" }),
  encryptedCode: text("encrypted_code").notNull(), codeHash: text("code_hash").notNull(),
  checkoutIntentId: uuid("checkout_intent_id").references(() => billingCheckoutIntents.id, { onDelete: "restrict" }),
  issuedAt: instant("issued_at"), redeemedAt: instant("redeemed_at"), expiresAt: instant("expires_at").notNull(),
}, (t) => [uniqueIndex("billing_offer_codes_hash_unique").on(t.codeHash), uniqueIndex("billing_offer_codes_intent_unique").on(t.checkoutIntentId)]);

export const billingProviderEvents = pgTable("billing_provider_events", {
  id: text("id").primaryKey(), payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
  state: text("state").$type<"pending" | "processing" | "completed" | "needs_review">().notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0), availableAt: instant("available_at").notNull().defaultNow(),
  leaseUntil: instant("lease_until"), lastError: text("last_error"), receivedAt: instant("received_at").notNull().defaultNow(),
}, (t) => [index("billing_provider_events_queue_idx").on(t.state, t.availableAt)]);

export const billingAudit = pgTable("billing_audit", {
  id: uuid("id").defaultRandom().primaryKey(), actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "set null" }),
  action: text("action").notNull(), details: jsonb("details").$type<Record<string, unknown>>().notNull(),
  createdAt: instant("created_at").notNull().defaultNow(),
});
