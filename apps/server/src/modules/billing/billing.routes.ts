import { createRoute, z } from "@hono/zod-openapi";
import { bodyLimit } from "hono/body-limit";
import { env } from "../../config/env";
import { db } from "../../db/client";
import { billingProviderEvents } from "../../db/schema";
import { createOpenApiApp } from "../../openapi/create-app";
import { errorResponses, jsonDataResponse } from "../../openapi/responses";
import { bearerSecurity } from "../../openapi/security";
import { AppError, badRequest, notFound } from "../../shared/errors";
import { ok } from "../../shared/http";
import { getCheckout, startAutopayCheckout, startPlanCheckout } from "./billing-checkout.service";
import { addShoes, cancelPlan, listCharges, payNow, resumePlan, scheduleRenewal } from "./billing-subscription.service";
import { createBillingQuote, getBillingOverview, getPrices, getSubscriptionDto, listBillingDevices } from "./billing.service";
import { processBillingEvents } from "./billing.worker";
import { applyFakeOutcome } from "./providers/fake.provider";
import { billingProvider, ProviderError } from "./providers";

const term = z.union([z.literal(3), z.literal(6), z.literal(12)]);
const deviceIds = z.array(z.string().uuid()).min(1).max(5).refine((ids) => new Set(ids).size === ids.length, "Shoes must be unique.");
const quoteInput = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("new_plan"), deviceIds, termMonths: term }),
  z.object({ kind: z.literal("add_shoes"), deviceIds }),
]);
const applyQuoteInput = z.object({ quoteId: z.string().uuid(), idempotencyKey: z.string().uuid() });
const revisionInput = z.object({ revision: z.number().int().positive() });
const renewalInput = revisionInput.extend({ nextDeviceIds: deviceIds.nullable(), nextTermMonths: term.nullable() });
const idParam = z.object({ id: z.string().uuid() });
const result = { 200: jsonDataResponse(z.unknown(), "Billing response."), ...errorResponses([400, 401, 403, 404, 409, 503]) };
const json = <T extends z.ZodTypeAny>(schema: T) => ({ body: { content: { "application/json": { schema } }, required: true as const } });

// Any family member may start the family plan. The service layer limits each
// family to one live plan and restricts changes to the person who pays.
const billingRoutes = createOpenApiApp();
const base = { tags: ["Billing"], security: bearerSecurity, responses: result };
const org = (c: { get(key: "organization"): { id: string } }) => c.get("organization").id;

billingRoutes.openapi(createRoute({ ...base, method: "get", path: "/billing/overview" }), async (c) => ok(c, await getBillingOverview(org(c), c.get("user").id)));
billingRoutes.openapi(createRoute({ ...base, method: "get", path: "/billing/prices" }), async (c) => ok(c, await getPrices()));
billingRoutes.openapi(createRoute({ ...base, method: "get", path: "/billing/devices" }), async (c) => ok(c, await listBillingDevices(org(c))));
billingRoutes.openapi(createRoute({ ...base, method: "get", path: "/billing/subscription" }), async (c) => ok(c, await getSubscriptionDto(org(c), c.get("user").id)));
billingRoutes.openapi(createRoute({ ...base, method: "post", path: "/billing/quotes", request: json(quoteInput) }), async (c) => ok(c, await createBillingQuote(org(c), c.get("user").id, c.req.valid("json"))));
billingRoutes.openapi(createRoute({ ...base, method: "post", path: "/billing/checkout", request: json(applyQuoteInput) }), async (c) => ok(c, await startPlanCheckout(org(c), c.get("user").id, c.req.valid("json"))));
billingRoutes.openapi(createRoute({ ...base, method: "get", path: "/billing/checkout/{id}", request: { params: idParam } }), async (c) => ok(c, await getCheckout(org(c), c.get("user").id, c.req.valid("param").id)));
billingRoutes.openapi(createRoute({ ...base, method: "post", path: "/billing/subscription/add-shoes", request: json(applyQuoteInput) }), async (c) => ok(c, await addShoes(org(c), c.get("user").id, c.req.valid("json"))));
billingRoutes.openapi(createRoute({ ...base, method: "put", path: "/billing/subscription/renewal", request: json(renewalInput) }), async (c) => ok(c, await scheduleRenewal(org(c), c.get("user").id, c.req.valid("json"))));
billingRoutes.openapi(createRoute({ ...base, method: "post", path: "/billing/subscription/cancel", request: json(revisionInput) }), async (c) => ok(c, await cancelPlan(org(c), c.get("user").id, c.req.valid("json").revision)));
billingRoutes.openapi(createRoute({ ...base, method: "post", path: "/billing/subscription/resume", request: json(revisionInput) }), async (c) => ok(c, await resumePlan(org(c), c.get("user").id, c.req.valid("json").revision)));
billingRoutes.openapi(createRoute({ ...base, method: "post", path: "/billing/subscription/autopay", request: json(z.object({ idempotencyKey: z.string().uuid() })) }), async (c) => ok(c, await startAutopayCheckout(org(c), c.get("user").id, c.req.valid("json").idempotencyKey)));
billingRoutes.openapi(createRoute({ ...base, method: "post", path: "/billing/charges/{id}/pay-now", request: { params: idParam } }), async (c) => ok(c, await payNow(org(c), c.get("user").id, c.req.valid("param").id)));
billingRoutes.openapi(createRoute({ ...base, method: "get", path: "/billing/charges" }), async (c) => ok(c, await listCharges(org(c), c.get("user").id)));

// Test controls for the fake provider: approve, decline or fail anything, then
// apply it straight away so the app sees the result on its next poll.
const fakeParams = z.object({ kind: z.enum(["mandate", "charge", "payment"]), id: z.string().uuid() });
const fakeOutcome = z.object({ outcome: z.enum(["approve", "bank_pending", "decline", "expire", "pay", "fail", "cancel_by_customer", "pause_by_customer", "card_expired"]) });
billingRoutes.openapi(createRoute({ ...base, method: "post", path: "/billing/dev/fake/{kind}/{id}", request: { params: fakeParams, ...json(fakeOutcome) } }), async (c) => {
  if (env.BILLING_PROVIDER !== "fake" || env.NODE_ENV === "production") throw notFound("NOT_FOUND", "Not found.");
  const { kind, id } = c.req.valid("param");
  await applyFakeOutcome(kind, id, c.req.valid("json").outcome);
  await processBillingEvents();
  return ok(c, { ok: true });
});

const billingWebhookRoutes = createOpenApiApp();
billingWebhookRoutes.use("/webhooks/billing/*", bodyLimit({ maxSize: 256 * 1024 }));
billingWebhookRoutes.post("/webhooks/billing/:provider", async (c) => {
  const name = c.req.param("provider");
  if (name !== "cashfree" || env.BILLING_PROVIDER !== "cashfree") throw notFound("NOT_FOUND", "Not found.");
  const raw = await c.req.text();
  let events;
  try { events = billingProvider(name).parseWebhook(raw, Object.fromEntries(c.req.raw.headers.entries())); }
  catch (error) {
    if (error instanceof AppError) throw error;
    throw badRequest(error instanceof ProviderError ? error.message : "Invalid webhook.");
  }
  // Store and acknowledge; the worker re-reads each object from the provider before acting.
  if (events.length) await db.insert(billingProviderEvents).values(events.map((event) => ({ id: `${name}:${event.id}`, payload: { provider: name, kind: event.kind, ref: event.ref } }))).onConflictDoNothing();
  return ok(c, { accepted: true });
});

export { billingRoutes, billingWebhookRoutes };
