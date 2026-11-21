// Setting up an autopay: for a new plan, or to replace the one a plan uses
// (new payment method, or turning autopay back on).
import { and, eq, inArray } from "drizzle-orm";
import type { BillingCheckoutDto, BillingCheckoutTokenDto } from "@stepwhere/types";
import { env } from "../../config/env";
import { db } from "../../db/client";
import { billingCheckoutIntents, billingMandates, users } from "../../db/schema";
import { AppError, conflict, notFound } from "../../shared/errors";
import type { BillingTransaction } from "./billing-ownership.service";
import { refreshMandate } from "./billing-ledger.service";
import { assertNoOtherFamilyPlan, getBillingCustomer, getLiveSubscription, loadQuote, lockBilling, quoteDto, requirePurchasesEnabled, requirePurchaser, validateSelection } from "./billing.service";
import { activeBillingProvider, billingProvider } from "./providers";

/** How long the person has to approve the autopay in their UPI app or bank. */
const AUTHORIZATION_TTL_MS = 30 * 60_000;
const OPEN_STATES = ["awaiting_authorization", "bank_pending"] as const;
type Intent = typeof billingCheckoutIntents.$inferSelect;
type Mandate = typeof billingMandates.$inferSelect;

function checkoutDto(intent: Intent, userCustomerId: string | null): BillingCheckoutDto {
  // Only the person approving the autopay ever receives its session.
  const token = intent.state === "awaiting_authorization" && intent.customerId === userCustomerId ? intent.checkoutToken as BillingCheckoutTokenDto | null : null;
  return {
    id: intent.id, kind: intent.kind, state: intent.state, token, failureReason: intent.failureReason,
    subscriptionId: intent.subscriptionId, quote: intent.snapshot ? quoteDto(intent.quoteId ?? intent.id, intent.snapshot, intent.expiresAt) : null,
    createdAt: intent.createdAt.toISOString(), updatedAt: intent.updatedAt.toISOString(),
  };
}

/**
 * One autopay setup per family at a time. The same person starting again
 * replaces their earlier attempt; someone else has to wait for it to finish.
 */
async function clearOpenCheckouts(tx: BillingTransaction, organizationId: string, customerId: string, now: Date) {
  const superseded: Mandate[] = [];
  const open = await tx.select().from(billingCheckoutIntents).where(and(eq(billingCheckoutIntents.organizationId, organizationId), inArray(billingCheckoutIntents.state, [...OPEN_STATES])));
  for (const intent of open) {
    if (intent.expiresAt <= now) {
      await tx.update(billingCheckoutIntents).set({ state: "expired", failureReason: "expired", updatedAt: now }).where(eq(billingCheckoutIntents.id, intent.id));
    } else if (intent.customerId === customerId) {
      await tx.update(billingCheckoutIntents).set({ state: "abandoned", failureReason: "superseded", updatedAt: now }).where(eq(billingCheckoutIntents.id, intent.id));
    } else {
      throw new AppError(409, "CHECKOUT_IN_PROGRESS", "Someone in your family is setting up a plan right now.");
    }
    const [mandate] = await tx.select().from(billingMandates).where(eq(billingMandates.id, intent.mandateId));
    if (mandate) superseded.push(mandate);
  }
  return superseded;
}

async function cancelMandates(mandates: Mandate[]) {
  for (const mandate of mandates) {
    await billingProvider(mandate.provider).cancelMandate({ mandateRef: mandate.id, providerMandateId: mandate.providerMandateId }).catch(() => undefined);
    await db.update(billingMandates).set({ status: "cancelled", cancelledAt: new Date(), updatedAt: new Date() }).where(and(eq(billingMandates.id, mandate.id), inArray(billingMandates.status, ["pending_authorization", "bank_pending", "active"])));
  }
}

/** Creates the mandate at the provider and stores the session for the app. */
async function openAtProvider(intent: Intent, mandate: Mandate, userId: string) {
  const [user] = await db.select({ name: users.name, email: users.email, phone: users.phoneNumber }).from(users).where(eq(users.id, userId));
  const provider = billingProvider(mandate.provider);
  try {
    const opened = await provider.createMandate({
      mandateRef: mandate.id, customer: { name: user.name, email: user.email, phone: user.phone },
      maxAmountMinor: mandate.maxAmountMinor, expiresAt: intent.expiresAt, note: "Stepwhere family plan",
    });
    await db.update(billingMandates).set({ providerMandateId: opened.providerMandateId, updatedAt: new Date() }).where(eq(billingMandates.id, mandate.id));
    const [updated] = await db.update(billingCheckoutIntents).set({ checkoutToken: opened.token, updatedAt: new Date() }).where(eq(billingCheckoutIntents.id, intent.id)).returning();
    return updated;
  } catch (error) {
    const now = new Date();
    await db.update(billingMandates).set({ status: "failed", failureReason: "provider_error", updatedAt: now }).where(eq(billingMandates.id, mandate.id));
    await db.update(billingCheckoutIntents).set({ state: "failed", failureReason: "provider_error", updatedAt: now }).where(eq(billingCheckoutIntents.id, intent.id));
    if (error instanceof AppError) throw error;
    throw new AppError(503, "SERVICE_UNAVAILABLE", "Couldn't reach the payment service. Nothing was set up.");
  }
}

async function existingByIdempotency(tx: BillingTransaction, customerId: string, idempotencyKey: string) {
  const [existing] = await tx.select().from(billingCheckoutIntents).where(and(eq(billingCheckoutIntents.customerId, customerId), eq(billingCheckoutIntents.idempotencyKey, idempotencyKey)));
  return existing ?? null;
}

export async function startPlanCheckout(organizationId: string, userId: string, input: { quoteId: string; idempotencyKey: string }): Promise<BillingCheckoutDto> {
  requirePurchasesEnabled();
  const provider = activeBillingProvider();
  const prepared = await db.transaction(async (tx) => {
    const customer = await getBillingCustomer(userId, tx);
    await lockBilling(tx, customer.id);
    await lockBilling(tx, organizationId);
    const existing = await existingByIdempotency(tx, customer.id, input.idempotencyKey);
    if (existing) {
      if (existing.organizationId !== organizationId || existing.quoteId !== input.quoteId) throw conflict("That request was already used for a different checkout.");
      return { customerId: customer.id, intent: existing, mandate: null, superseded: [] };
    }
    const quote = await loadQuote(tx, organizationId, customer.id, input.quoteId, "new_plan");
    if (await getLiveSubscription(organizationId, tx)) throw new AppError(409, "PLAN_EXISTS", "Your family already has a plan.");
    await assertNoOtherFamilyPlan(tx, customer.id, organizationId);
    await validateSelection(tx, organizationId, quote.snapshot.deviceIds);
    const now = new Date();
    const superseded = await clearOpenCheckouts(tx, organizationId, customer.id, now);
    const [mandate] = await tx.insert(billingMandates).values({ provider: provider.name, environment: env.BILLING_ENVIRONMENT, customerId: customer.id, organizationId, maxAmountMinor: quote.snapshot.mandateMaxMinor }).returning();
    const [intent] = await tx.insert(billingCheckoutIntents).values({ kind: "new_plan", organizationId, customerId: customer.id, quoteId: quote.id, mandateId: mandate.id, snapshot: quote.snapshot, idempotencyKey: input.idempotencyKey, expiresAt: new Date(now.getTime() + AUTHORIZATION_TTL_MS) }).returning();
    return { customerId: customer.id, intent, mandate, superseded };
  });
  await cancelMandates(prepared.superseded);
  const intent = prepared.mandate ? await openAtProvider(prepared.intent, prepared.mandate, userId) : prepared.intent;
  return checkoutDto(intent, prepared.customerId);
}

/** A new autopay for an existing plan: a new payment method, or autopay back on after it was turned off. */
export async function startAutopayCheckout(organizationId: string, userId: string, idempotencyKey: string): Promise<BillingCheckoutDto> {
  requirePurchasesEnabled();
  const provider = activeBillingProvider();
  const prepared = await db.transaction(async (tx) => {
    const { customer, subscription } = await requirePurchaser(tx, organizationId, userId);
    const existing = await existingByIdempotency(tx, customer.id, idempotencyKey);
    if (existing) {
      if (existing.subscriptionId !== subscription.id) throw conflict("That request was already used for a different checkout.");
      return { customerId: customer.id, intent: existing, mandate: null, superseded: [] };
    }
    const now = new Date();
    const superseded = await clearOpenCheckouts(tx, organizationId, customer.id, now);
    const [mandate] = await tx.insert(billingMandates).values({ provider: provider.name, environment: env.BILLING_ENVIRONMENT, customerId: customer.id, organizationId, maxAmountMinor: env.BILLING_MANDATE_MAX_MINOR }).returning();
    const [intent] = await tx.insert(billingCheckoutIntents).values({ kind: "replace_mandate", organizationId, customerId: customer.id, subscriptionId: subscription.id, mandateId: mandate.id, idempotencyKey, expiresAt: new Date(now.getTime() + AUTHORIZATION_TTL_MS) }).returning();
    return { customerId: customer.id, intent, mandate, superseded };
  });
  await cancelMandates(prepared.superseded);
  const intent = prepared.mandate ? await openAtProvider(prepared.intent, prepared.mandate, userId) : prepared.intent;
  return checkoutDto(intent, prepared.customerId);
}

/** Polled by the app while the person approves. Checks the provider directly in case a webhook is late. */
export async function getCheckout(organizationId: string, userId: string, id: string): Promise<BillingCheckoutDto> {
  const [initial] = await db.select().from(billingCheckoutIntents).where(and(eq(billingCheckoutIntents.id, id), eq(billingCheckoutIntents.organizationId, organizationId)));
  if (!initial) throw notFound("NOT_FOUND", "Checkout not found.");
  if (OPEN_STATES.includes(initial.state as typeof OPEN_STATES[number])) {
    await refreshMandate(initial.mandateId).catch(() => undefined);
    const [current] = await db.select().from(billingCheckoutIntents).where(eq(billingCheckoutIntents.id, id));
    if (current.state === "awaiting_authorization" && current.expiresAt <= new Date()) await expireCheckout(current);
  }
  const [intent] = await db.select().from(billingCheckoutIntents).where(eq(billingCheckoutIntents.id, id));
  const customer = await getBillingCustomer(userId);
  return checkoutDto(intent, customer.id);
}

export async function expireCheckout(intent: Intent) {
  const [expired] = await db.update(billingCheckoutIntents).set({ state: "expired", failureReason: "expired", updatedAt: new Date() }).where(and(eq(billingCheckoutIntents.id, intent.id), eq(billingCheckoutIntents.state, "awaiting_authorization"))).returning();
  if (!expired) return;
  const [mandate] = await db.select().from(billingMandates).where(eq(billingMandates.id, intent.mandateId));
  if (mandate) await cancelMandates([mandate]);
}
