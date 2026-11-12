import { createRoute, z } from "@hono/zod-openapi";
import { and, eq } from "drizzle-orm";
import { db } from "../../db/client";
import { billingAudit, billingCatalog, billingCheckoutIntents, billingOfferCodes, billingProviderEvents, billingTransactions } from "../../db/schema";
import { createOpenApiApp } from "../../openapi/create-app";
import { errorResponses, jsonDataResponse } from "../../openapi/responses";
import { bearerSecurity } from "../../openapi/security";
import { badRequest, conflict, notFound } from "../../shared/errors";
import { ok } from "../../shared/http";
import { releaseOwnedDevice, replaceWarrantyDevice } from "./billing-admin.service";
import { encryptOfferCode, lockBilling, offerCodeHash } from "./billing.service";
import { reconcileBillingCustomer } from "./billing-verification.service";

const routes = createOpenApiApp();
const result = { 200: jsonDataResponse(z.unknown(), "Billing administration result."), ...errorResponses([400, 401, 403, 404, 409]) };
const catalogInput = z.object({ store: z.enum(["APP_STORE", "PLAY_STORE"]), environment: z.enum(["SANDBOX", "PRODUCTION"]), shoeCount: z.number().int().min(1).max(5), termMonths: z.union([z.literal(3), z.literal(6), z.literal(12)]), productId: z.string().min(1), basePlanId: z.string().nullable(), offerId: z.string().nullable(), currency: z.string().regex(/^[A-Z]{3}$/), storefront: z.string().regex(/^[A-Z]{2,3}$/), trialCreditBand: z.union([z.literal(0), z.literal(7), z.literal(14), z.literal(21), z.literal(30)]), amountMinor: z.number().int().min(0), renewalAmountMinor: z.number().int().positive(), enabled: z.boolean().default(false) });
routes.openapi(createRoute({ method: "post", path: "/admin/billing/catalog", tags: ["Admin Billing"], security: bearerSecurity, request: { body: { required: true, content: { "application/json": { schema: catalogInput } } } }, responses: result }), async (c) => {
  const input = c.req.valid("json");
  if (input.store === "APP_STORE" && (input.basePlanId !== null || input.productId !== `com.stepwhere.family.${input.shoeCount}.${input.termMonths}m`)) throw badRequest("Apple product does not match the approved family catalog.");
  if (input.store === "PLAY_STORE" && (input.productId !== `stepwhere_family_${input.shoeCount}` || input.basePlanId !== `p${input.termMonths}m`)) throw badRequest("Play product/base plan does not match the approved family catalog.");
  if (input.trialCreditBand && (!input.offerId || input.amountMinor > input.renewalAmountMinor * (1 - input.trialCreditBand / (30 * input.termMonths)))) throw badRequest("Trial offer must cover its full credit band and have a store offer identifier.");
  if (!input.trialCreditBand && (input.offerId || input.amountMinor !== input.renewalAmountMinor)) throw badRequest("Normal pricing must match the renewal price and have no trial offer.");
  const entry = await db.transaction(async (tx) => {
    const [row] = await tx.insert(billingCatalog).values(input).onConflictDoUpdate({ target: [billingCatalog.store, billingCatalog.environment, billingCatalog.shoeCount, billingCatalog.termMonths, billingCatalog.currency, billingCatalog.storefront, billingCatalog.trialCreditBand], set: { ...input, updatedAt: new Date() } }).returning();
    await tx.insert(billingAudit).values({ actorUserId: c.get("user").id, action: "catalog_configured", details: { catalogId: row.id, ...input } });
    return row;
  });
  return ok(c, entry);
});
routes.openapi(createRoute({ method: "post", path: "/admin/billing/offer-codes", tags: ["Admin Billing"], security: bearerSecurity, request: { body: { required: true, content: { "application/json": { schema: z.object({ catalogId: z.string().uuid(), expiresAt: z.string().datetime({ offset: true }), codes: z.array(z.string().min(1).max(128)).min(1).max(500) }) } } } }, responses: result }), async (c) => {
  const input = c.req.valid("json");
  const [catalog] = await db.select().from(billingCatalog).where(eq(billingCatalog.id, input.catalogId));
  if (!catalog || catalog.store !== "APP_STORE" || !catalog.trialCreditBand) throw badRequest("Offer codes require an Apple trial-credit catalog entry.");
  if (new Date(input.expiresAt) <= new Date()) throw badRequest("Offer codes must not be expired.");
  const count = await db.transaction(async (tx) => {
    const codes = await tx.insert(billingOfferCodes).values([...new Set(input.codes)].map((code) => ({ catalogId: input.catalogId, encryptedCode: encryptOfferCode(code), codeHash: offerCodeHash(code), expiresAt: new Date(input.expiresAt) }))).onConflictDoNothing().returning({ id: billingOfferCodes.id });
    await tx.insert(billingAudit).values({ actorUserId: c.get("user").id, action: "offer_codes_imported", details: { catalogId: input.catalogId, count: codes.length } });
    return codes.length;
  });
  return ok(c, { imported: count });
});
routes.openapi(createRoute({ method: "post", path: "/admin/billing/warranty-replacements", tags: ["Admin Billing"], security: bearerSecurity, request: { body: { required: true, content: { "application/json": { schema: z.object({ organizationId: z.string().uuid(), oldDeviceId: z.string().uuid(), newDeviceId: z.string().uuid(), reason: z.string().trim().min(10).max(500) }) } } } }, responses: result }), async (c) => { const input = c.req.valid("json"); return ok(c, await replaceWarrantyDevice(c.get("user").id, input.organizationId, input.oldDeviceId, input.newDeviceId, input.reason)); });
routes.openapi(createRoute({ method: "post", path: "/admin/billing/ownership-release", tags: ["Admin Billing"], security: bearerSecurity, request: { body: { required: true, content: { "application/json": { schema: z.object({ deviceId: z.string().uuid(), reason: z.string().trim().min(10).max(500) }) } } } }, responses: result }), async (c) => { const input = c.req.valid("json"); return ok(c, await releaseOwnedDevice(c.get("user").id, input.deviceId, input.reason)); });
routes.openapi(createRoute({ method: "get", path: "/admin/billing/review-queue", tags: ["Admin Billing"], security: bearerSecurity, responses: result }), async (c) => {
  const events = await db.select({ id: billingProviderEvents.id, state: billingProviderEvents.state, attempts: billingProviderEvents.attempts, lastError: billingProviderEvents.lastError, receivedAt: billingProviderEvents.receivedAt }).from(billingProviderEvents).where(eq(billingProviderEvents.state, "needs_review")).limit(100);
  const intents = await db.select({ id: billingCheckoutIntents.id, organizationId: billingCheckoutIntents.organizationId, state: billingCheckoutIntents.state, createdAt: billingCheckoutIntents.createdAt }).from(billingCheckoutIntents).where(eq(billingCheckoutIntents.state, "needs_review")).limit(100);
  const transactions = await db.select({ id: billingTransactions.id, customerId: billingTransactions.customerId, productId: billingTransactions.productId, store: billingTransactions.store, environment: billingTransactions.environment, purchasedAt: billingTransactions.purchasedAt }).from(billingTransactions).where(eq(billingTransactions.status, "unassigned")).limit(100);
  return ok(c, { events, intents, transactions });
});
routes.openapi(createRoute({ method: "post", path: "/admin/billing/events/{id}/retry", tags: ["Admin Billing"], security: bearerSecurity, request: { params: z.object({ id: z.string().min(1).max(256) }) }, responses: result }), async (c) => {
  const [event] = await db.update(billingProviderEvents).set({ state: "pending", attempts: 0, availableAt: new Date(), leaseUntil: null }).where(and(eq(billingProviderEvents.id, c.req.valid("param").id), eq(billingProviderEvents.state, "needs_review"))).returning({ id: billingProviderEvents.id });
  if (!event) throw notFound("NOT_FOUND", "Review event not found.");
  return ok(c, { queued: true });
});
routes.openapi(createRoute({ method: "post", path: "/admin/billing/checkout-intents/{id}/abandon", tags: ["Admin Billing"], security: bearerSecurity, request: { params: z.object({ id: z.string().uuid() }), body: { required: true, content: { "application/json": { schema: z.object({ reason: z.string().trim().min(10).max(500) }) } } } }, responses: result }), async (c) => {
  const id = c.req.valid("param").id;
  const [initial] = await db.select().from(billingCheckoutIntents).where(eq(billingCheckoutIntents.id, id));
  if (!initial) throw notFound("NOT_FOUND", "Checkout intent not found.");
  // Support cannot clear a checkout using a client claim that payment failed.
  await reconcileBillingCustomer(initial.customerId);
  await db.transaction(async (tx) => {
    await lockBilling(tx, initial.customerId);
    if (initial.organizationId) await lockBilling(tx, initial.organizationId);
    const [intent] = await tx.select().from(billingCheckoutIntents).where(eq(billingCheckoutIntents.id, id));
    if (intent.state === "completed") throw conflict("The checkout has already completed.");
    const [payment] = await tx.select({ id: billingTransactions.id }).from(billingTransactions).where(and(eq(billingTransactions.customerId, intent.customerId), eq(billingTransactions.productId, intent.snapshot.productId), eq(billingTransactions.store, intent.snapshot.store), eq(billingTransactions.environment, intent.snapshot.environment), eq(billingTransactions.status, "unassigned"))).limit(1);
    if (payment) throw conflict("Resolve the verified unassigned payment before abandoning checkout.");
    await tx.update(billingCheckoutIntents).set({ state: "abandoned", updatedAt: new Date() }).where(eq(billingCheckoutIntents.id, id));
    await tx.insert(billingAudit).values({ actorUserId: c.get("user").id, organizationId: intent.organizationId, action: "checkout_abandoned_after_reconciliation", details: { intentId: id, reason: c.req.valid("json").reason } });
  });
  return ok(c, { abandoned: true, issuedOfferCodeRemainsReserved: true });
});
export { routes as billingAdminRoutes };
