import { createRoute, z } from "@hono/zod-openapi";
import { bodyLimit } from "hono/body-limit";
import { Webhook } from "svix";
import { env } from "../../config/env";
import { db } from "../../db/client";
import { billingProviderEvents } from "../../db/schema";
import { createOpenApiApp } from "../../openapi/create-app";
import { errorResponses, jsonDataResponse } from "../../openapi/responses";
import { bearerSecurity } from "../../openapi/security";
import { AppError, badRequest } from "../../shared/errors";
import { ok } from "../../shared/http";
import { familyAdminMiddleware } from "../family/family.middleware";
import { createBillingQuote, createCheckoutIntent, getCheckoutIntent, listBillingDevices, purchaserSubscriptions, scheduleSelection, subscriptionDto } from "./billing.service";
import { syncPurchaser } from "./billing-verification.service";

const deviceIds = z.array(z.string().uuid()).min(1).max(5).refine((ids) => new Set(ids).size === ids.length, "Shoes must be unique.");
const quoteInput = z.object({ deviceIds, termMonths: z.union([z.literal(3), z.literal(6), z.literal(12)]), store: z.enum(["APP_STORE", "PLAY_STORE"]), currency: z.string().regex(/^[A-Z]{3}$/), storefront: z.string().regex(/^[A-Z]{2,3}$/) });
const result = { 200: jsonDataResponse(z.unknown(), "Billing response."), ...errorResponses([400, 401, 403, 404, 409, 503]) };
const billingRoutes = createOpenApiApp();
billingRoutes.use("/billing/quotes", familyAdminMiddleware);
billingRoutes.use("/billing/checkout-intents", familyAdminMiddleware);
billingRoutes.use("/billing/coverage-selection", familyAdminMiddleware);
billingRoutes.openapi(createRoute({ method: "get", path: "/billing/devices", tags: ["Billing"], security: bearerSecurity, responses: result }), async (c) => ok(c, await listBillingDevices(c.get("organization").id)));
billingRoutes.openapi(createRoute({ method: "get", path: "/billing/subscription", tags: ["Billing"], security: bearerSecurity, responses: result }), async (c) => ok(c, await subscriptionDto(c.get("organization").id, c.get("user").id)));
billingRoutes.openapi(createRoute({ method: "post", path: "/billing/quotes", tags: ["Billing"], security: bearerSecurity, request: { body: { content: { "application/json": { schema: quoteInput } }, required: true } }, responses: result }), async (c) => ok(c, await createBillingQuote(c.get("organization").id, c.get("user").id, c.req.valid("json"))));
billingRoutes.openapi(createRoute({ method: "post", path: "/billing/checkout-intents", tags: ["Billing"], security: bearerSecurity, request: { body: { content: { "application/json": { schema: z.object({ quoteId: z.string().uuid(), idempotencyKey: z.string().uuid() }) } }, required: true } }, responses: result }), async (c) => { const input = c.req.valid("json"); return ok(c, await createCheckoutIntent(c.get("organization").id, c.get("user").id, input.quoteId, input.idempotencyKey)); });
billingRoutes.openapi(createRoute({ method: "get", path: "/billing/checkout-intents/{id}", tags: ["Billing"], security: bearerSecurity, request: { params: z.object({ id: z.string().uuid() }) }, responses: result }), async (c) => ok(c, await getCheckoutIntent(c.get("organization").id, c.req.valid("param").id)));
billingRoutes.openapi(createRoute({ method: "patch", path: "/billing/coverage-selection", tags: ["Billing"], security: bearerSecurity, request: { body: { content: { "application/json": { schema: z.object({ deviceIds, revision: z.number().int().positive() }) } }, required: true } }, responses: result }), async (c) => { const input = c.req.valid("json"); return ok(c, await scheduleSelection(c.get("organization").id, c.get("user").id, input.deviceIds, input.revision)); });

// Purchaser routes intentionally do not require membership/admin role. A former
// admin must still be able to restore and manage their own store subscription.
const purchaserBillingRoutes = createOpenApiApp();
purchaserBillingRoutes.openapi(createRoute({ method: "get", path: "/billing/manage", tags: ["Billing"], security: bearerSecurity, responses: result }), async (c) => ok(c, await purchaserSubscriptions(c.get("user").id)));
purchaserBillingRoutes.openapi(createRoute({ method: "post", path: "/billing/sync", tags: ["Billing"], security: bearerSecurity, responses: result }), async (c) => ok(c, await syncPurchaser(c.get("user").id)));

const billingWebhookRoutes = createOpenApiApp();
billingWebhookRoutes.use("/webhooks/superwall", bodyLimit({ maxSize: 256 * 1024 }));
billingWebhookRoutes.post("/webhooks/superwall", async (c) => {
  if (!env.SUPERWALL_WEBHOOK_SECRET) throw new AppError(503, "BILLING_DISABLED", "Webhook is not configured.");
  const raw = await c.req.text();
  const id = c.req.header("svix-id"); const timestamp = c.req.header("svix-timestamp"); const signature = c.req.header("svix-signature");
  if (!id || !timestamp || !signature) throw badRequest("Missing webhook signature.");
  let payload: unknown;
  try { payload = new Webhook(env.SUPERWALL_WEBHOOK_SECRET).verify(raw, { "svix-id": id, "svix-timestamp": timestamp, "svix-signature": signature }); }
  catch { throw badRequest("Invalid webhook signature."); }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw badRequest("Invalid webhook payload.");
  await db.insert(billingProviderEvents).values({ id, payload: payload as Record<string, unknown> }).onConflictDoNothing();
  return ok(c, { accepted: true });
});
export { billingRoutes, purchaserBillingRoutes, billingWebhookRoutes };
