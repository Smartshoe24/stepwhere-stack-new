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

export type BillingTerm = 3 | 6 | 12;
export type BillingScheduleLine = { kind: "verify" | "first" | "add_shoes" | "renewal"; on: string; amountMinor: number; baseMinor: number; creditMinor: number; deviceIds: string[]; refunded: boolean };

// Everything a quote promised, so applying it later can never charge a
// different amount or date than the person agreed to.
export type BillingQuoteSnapshot = {
  kind: "new_plan" | "add_shoes";
  deviceIds: string[]; addedDeviceIds: string[]; shoeCount: number; termMonths: BillingTerm;
  currency: "INR"; priceBookVersion: number; perShoeMinor: number; renewalAmountMinor: number;
  startsAt: string; periodEndsAt: string; coverageStartsNow: boolean;
  deviceStartsAt: Record<string, string>;
  credits: { deviceId: string; days: number; amountMinor: number }[];
  schedule: BillingScheduleLine[];
  mandateMaxMinor: number;
  subscriptionId: string | null; subscriptionRevision: number | null;
};

// Per-shoe prices by billing period. A plan keeps the version it was sold at.
export const billingPriceBook = pgTable("billing_price_book", {
  id: uuid("id").defaultRandom().primaryKey(),
  version: integer("version").notNull(), currency: text("currency").$type<"INR">().notNull(),
  termMonths: integer("term_months").$type<BillingTerm>().notNull(), perShoeMinor: integer("per_shoe_minor").notNull(),
  activeFrom: instant("active_from").notNull(),
  createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: instant("created_at").notNull().defaultNow(),
}, (t) => [
  uniqueIndex("billing_price_book_entry_unique").on(t.version, t.currency, t.termMonths),
  check("billing_price_book_values", sql`${t.termMonths} in (3,6,12) and ${t.perShoeMinor} > 0 and ${t.version} > 0`),
]);

export const billingQuotes = pgTable("billing_quotes", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  customerId: uuid("customer_id").notNull().references(() => billingCustomers.id, { onDelete: "restrict" }),
  snapshot: jsonb("snapshot").$type<BillingQuoteSnapshot>().notNull(),
  createdAt: instant("created_at").notNull().defaultNow(), expiresAt: instant("expires_at").notNull(),
});

export type BillingProvider = "cashfree" | "fake";
export type BillingEnvironmentName = "SANDBOX" | "PRODUCTION";
export type MandateStatus = "pending_authorization" | "bank_pending" | "active" | "failed" | "expired" | "cancelled" | "customer_cancelled" | "customer_paused" | "card_expired";

// One autopay approval at the purchaser's bank. Its id is the reference we
// give the provider, so provider callbacks always resolve to our row.
export const billingMandates = pgTable("billing_mandates", {
  id: uuid("id").defaultRandom().primaryKey(),
  provider: text("provider").$type<BillingProvider>().notNull(), environment: text("environment").$type<BillingEnvironmentName>().notNull(),
  customerId: uuid("customer_id").notNull().references(() => billingCustomers.id, { onDelete: "restrict" }),
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "set null" }),
  providerMandateId: text("provider_mandate_id"),
  status: text("status").$type<MandateStatus>().notNull().default("pending_authorization"),
  method: text("method").$type<"upi" | "card" | "enach">(), methodLabel: text("method_label"),
  maxAmountMinor: integer("max_amount_minor").notNull(),
  failureReason: text("failure_reason"),
  authorizedAt: instant("authorized_at"), cancelledAt: instant("cancelled_at"),
  createdAt: instant("created_at").notNull().defaultNow(), updatedAt: instant("updated_at").notNull().defaultNow(),
  lastSyncedAt: instant("last_synced_at"),
}, (t) => [index("billing_mandates_customer_idx").on(t.customerId), index("billing_mandates_status_idx").on(t.status)]);

export type FamilySubscriptionState = "scheduled" | "active" | "past_due" | "cancelled" | "expired" | "revoked";

export const familySubscriptions = pgTable("family_subscriptions", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "set null" }),
  customerId: uuid("customer_id").notNull().references(() => billingCustomers.id, { onDelete: "restrict" }),
  provider: text("provider").$type<BillingProvider>().notNull(), environment: text("environment").$type<BillingEnvironmentName>().notNull(),
  mandateId: uuid("mandate_id").notNull().references(() => billingMandates.id, { onDelete: "restrict" }),
  currency: text("currency").$type<"INR">().notNull(),
  priceBookVersion: integer("price_book_version").notNull(), perShoeMinor: integer("per_shoe_minor").notNull(),
  shoeCount: integer("shoe_count").notNull(), termMonths: integer("term_months").$type<BillingTerm>().notNull(),
  deviceIds: jsonb("device_ids").$type<string[]>().notNull(),
  nextDeviceIds: jsonb("next_device_ids").$type<string[] | null>(),
  nextTermMonths: integer("next_term_months").$type<BillingTerm | null>(),
  state: text("state").$type<FamilySubscriptionState>().notNull(),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
  periodStartsAt: instant("period_starts_at").notNull(), periodEndsAt: instant("period_ends_at").notNull(),
  graceEndsAt: instant("grace_ends_at").notNull(),
  revision: integer("revision").notNull().default(1),
  createdAt: instant("created_at").notNull().defaultNow(), updatedAt: instant("updated_at").notNull().defaultNow(),
}, (t) => [
  uniqueIndex("family_subscriptions_family_live_unique").on(t.organizationId).where(sql`${t.state} in ('scheduled','active','past_due','cancelled')`),
  uniqueIndex("family_subscriptions_purchaser_live_unique").on(t.customerId).where(sql`${t.state} in ('scheduled','active','past_due','cancelled')`),
  check("family_subscriptions_dimensions", sql`${t.shoeCount} between 1 and 5 and ${t.termMonths} in (3,6,12) and ${t.periodEndsAt} > ${t.periodStartsAt}`),
]);

export const billingCheckoutIntents = pgTable("billing_checkout_intents", {
  id: uuid("id").defaultRandom().primaryKey(),
  kind: text("kind").$type<"new_plan" | "replace_mandate">().notNull(),
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "set null" }),
  customerId: uuid("customer_id").notNull().references(() => billingCustomers.id, { onDelete: "restrict" }),
  quoteId: uuid("quote_id").references(() => billingQuotes.id, { onDelete: "set null" }),
  subscriptionId: uuid("subscription_id").references(() => familySubscriptions.id, { onDelete: "restrict" }),
  mandateId: uuid("mandate_id").notNull().references(() => billingMandates.id, { onDelete: "restrict" }),
  snapshot: jsonb("snapshot").$type<BillingQuoteSnapshot | null>(),
  checkoutToken: jsonb("checkout_token").$type<Record<string, unknown> | null>(),
  idempotencyKey: uuid("idempotency_key").notNull(),
  state: text("state").$type<"awaiting_authorization" | "bank_pending" | "completed" | "failed" | "expired" | "abandoned">().notNull().default("awaiting_authorization"),
  failureReason: text("failure_reason").$type<"declined" | "expired" | "provider_error" | "superseded" | null>(),
  expiresAt: instant("expires_at").notNull(),
  createdAt: instant("created_at").notNull().defaultNow(), updatedAt: instant("updated_at").notNull().defaultNow(),
}, (t) => [
  uniqueIndex("billing_checkout_idempotency_unique").on(t.customerId, t.idempotencyKey),
  uniqueIndex("billing_checkout_family_open_unique").on(t.organizationId).where(sql`${t.state} in ('awaiting_authorization','bank_pending')`),
]);

export type BillingChargeKind = "verify" | "first" | "renewal" | "add_shoes" | "one_time";
// submitting: claimed by one worker while the provider call is in flight, so a
// charge is never sent twice.
export type BillingChargeStatus = "scheduled" | "submitting" | "submitted" | "paid" | "failed" | "cancelled" | "refunded" | "partially_refunded";
export type BillingChargeBreakdown = {
  perShoeMinor: number; termMonths: BillingTerm; deviceIds: string[];
  credits: { deviceId: string; days: number; amountMinor: number }[];
  /** Paid coverage this charge buys, per shoe. */
  coverage: { deviceId: string; startsAt: string; endsAt: string }[];
  periodStartsAt: string; periodEndsAt: string;
  /** For a one-off payment of a failed charge. */
  settlesChargeId?: string;
};

// Our id is the payment reference sent to the provider.
export const billingCharges = pgTable("billing_charges", {
  id: uuid("id").defaultRandom().primaryKey(),
  subscriptionId: uuid("subscription_id").notNull().references(() => familySubscriptions.id, { onDelete: "restrict" }),
  mandateId: uuid("mandate_id").references(() => billingMandates.id, { onDelete: "restrict" }),
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "set null" }),
  customerId: uuid("customer_id").notNull().references(() => billingCustomers.id, { onDelete: "restrict" }),
  provider: text("provider").$type<BillingProvider>().notNull(),
  kind: text("kind").$type<BillingChargeKind>().notNull(),
  status: text("status").$type<BillingChargeStatus>().notNull().default("scheduled"),
  dueOn: text("due_on").notNull(),
  periodStartsAt: instant("period_starts_at").notNull(),
  amountMinor: integer("amount_minor").notNull(), baseMinor: integer("base_minor").notNull(), creditMinor: integer("credit_minor").notNull().default(0),
  breakdown: jsonb("breakdown").$type<BillingChargeBreakdown>().notNull(),
  providerPaymentId: text("provider_payment_id"),
  attempts: integer("attempts").notNull().default(0), nextAttemptOn: text("next_attempt_on"),
  submittedAt: instant("submitted_at"), paidAt: instant("paid_at"), failedAt: instant("failed_at"), failureReason: text("failure_reason"),
  refundedMinor: integer("refunded_minor").notNull().default(0),
  lastCheckedAt: instant("last_checked_at"),
  createdAt: instant("created_at").notNull().defaultNow(), updatedAt: instant("updated_at").notNull().defaultNow(),
}, (t) => [
  // One live first or renewal charge per period. A replaced charge is cancelled
  // and a new row raised, because each row is one payment at the provider.
  uniqueIndex("billing_charges_period_unique").on(t.subscriptionId, t.kind, t.periodStartsAt).where(sql`${t.kind} in ('first','renewal') and ${t.status} <> 'cancelled'`),
  index("billing_charges_due_idx").on(t.status, t.dueOn),
  index("billing_charges_subscription_idx").on(t.subscriptionId),
  check("billing_charges_amounts", sql`${t.amountMinor} > 0 and ${t.refundedMinor} >= 0 and ${t.refundedMinor} <= ${t.amountMinor}`),
]);

export const billingRefunds = pgTable("billing_refunds", {
  id: uuid("id").defaultRandom().primaryKey(),
  chargeId: uuid("charge_id").notNull().references(() => billingCharges.id, { onDelete: "restrict" }),
  amountMinor: integer("amount_minor").notNull(), reason: text("reason").notNull(),
  status: text("status").$type<"pending" | "succeeded" | "failed">().notNull().default("pending"),
  providerRefundId: text("provider_refund_id"),
  actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
  revokeCoverage: boolean("revoke_coverage").notNull().default(false),
  createdAt: instant("created_at").notNull().defaultNow(), updatedAt: instant("updated_at").notNull().defaultNow(),
}, (t) => [index("billing_refunds_charge_idx").on(t.chargeId), check("billing_refunds_amount", sql`${t.amountMinor} > 0`)]);

export const billingInvoiceSequences = pgTable("billing_invoice_sequences", {
  financialYear: text("financial_year").primaryKey(), lastNumber: integer("last_number").notNull(),
});

export const billingInvoices = pgTable("billing_invoices", {
  id: uuid("id").defaultRandom().primaryKey(),
  chargeId: uuid("charge_id").notNull().references(() => billingCharges.id, { onDelete: "restrict" }),
  number: text("number").notNull(), financialYear: text("financial_year").notNull(), issuedAt: instant("issued_at").notNull(),
  amountMinor: integer("amount_minor").notNull(), taxableMinor: integer("taxable_minor").notNull(),
  cgstMinor: integer("cgst_minor").notNull(), sgstMinor: integer("sgst_minor").notNull(), igstMinor: integer("igst_minor").notNull(),
  buyer: jsonb("buyer").$type<{ name: string | null; email: string | null; phone: string | null }>().notNull(),
  lines: jsonb("lines").$type<{ description: string; amountMinor: number }[]>().notNull(),
  pdfKey: text("pdf_key"),
}, (t) => [uniqueIndex("billing_invoices_charge_unique").on(t.chargeId), uniqueIndex("billing_invoices_number_unique").on(t.number)]);

// Test double state for the fake provider, used before Cashfree is connected
// and in tests. Never read in production.
export const billingFakeObjects = pgTable("billing_fake_objects", {
  ref: text("ref").primaryKey(), kind: text("kind").$type<"mandate" | "charge" | "payment" | "refund">().notNull(),
  status: text("status").notNull(), data: jsonb("data").$type<Record<string, unknown>>().notNull(),
  createdAt: instant("created_at").notNull().defaultNow(), updatedAt: instant("updated_at").notNull().defaultNow(),
});

export const deviceCoverageIntervals = pgTable("device_coverage_intervals", {
  id: uuid("id").defaultRandom().primaryKey(),
  deviceId: uuid("device_id").notNull().references(() => devices.id, { onDelete: "restrict" }),
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "set null" }),
  subscriptionId: uuid("subscription_id").references(() => familySubscriptions.id, { onDelete: "restrict" }),
  grantKey: text("grant_key").notNull(),
  // Provisional coverage starts tracking before the first charge clears and is
  // revoked if that charge fails.
  source: text("source").$type<"trial" | "paid" | "grace" | "provisional" | "legacy" | "support">().notNull(),
  startsAt: instant("starts_at").notNull(), endsAt: instant("ends_at").notNull(), revokedAt: instant("revoked_at"),
}, (t) => [uniqueIndex("device_coverage_grant_unique").on(t.deviceId, t.grantKey, t.source), index("device_coverage_lookup_idx").on(t.deviceId, t.startsAt, t.endsAt), check("device_coverage_order", sql`${t.endsAt} >= ${t.startsAt}`)]);

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
