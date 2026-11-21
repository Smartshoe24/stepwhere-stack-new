import { createRoute, z } from "@hono/zod-openapi";
import { and, eq, inArray, isNull, lt } from "drizzle-orm";
import { db } from "../../db/client";
import { billingCharges, billingCheckoutIntents, billingProviderEvents, familySubscriptions } from "../../db/schema";
import { createOpenApiApp } from "../../openapi/create-app";
import { errorResponses, jsonDataResponse } from "../../openapi/responses";
import { bearerSecurity } from "../../openapi/security";
import { notFound } from "../../shared/errors";
import { ok } from "../../shared/http";
import { familyBillingDetail, grantSupportCoverage, publishPrices, refundCharge, releaseOwnedDevice, replaceWarrantyDevice } from "./billing-admin.service";

const routes = createOpenApiApp();
const result = { 200: jsonDataResponse(z.unknown(), "Billing administration result."), ...errorResponses([400, 401, 403, 404, 409, 503]) };
const base = { tags: ["Admin Billing"], security: bearerSecurity, responses: result };
const json = <T extends z.ZodTypeAny>(schema: T) => ({ body: { required: true as const, content: { "application/json": { schema } } } });
const reason = z.string().trim().min(10).max(500);

routes.openapi(createRoute({ ...base, method: "post", path: "/admin/billing/prices", request: json(z.object({
  activeFrom: z.string().datetime({ offset: true }),
  prices: z.array(z.object({ termMonths: z.union([z.literal(3), z.literal(6), z.literal(12)]), perShoeMinor: z.number().int().min(100) })).length(3),
})) }), async (c) => { const input = c.req.valid("json"); return ok(c, await publishPrices(c.get("user").id, input.prices, new Date(input.activeFrom))); });

routes.openapi(createRoute({ ...base, method: "post", path: "/admin/billing/charges/{id}/refund", request: { params: z.object({ id: z.string().uuid() }), ...json(z.object({ amountMinor: z.number().int().positive(), reason, revokeCoverage: z.boolean().default(false) })) } }), async (c) => {
  const input = c.req.valid("json");
  return ok(c, await refundCharge(c.get("user").id, c.req.valid("param").id, input.amountMinor, input.reason, input.revokeCoverage));
});

routes.openapi(createRoute({ ...base, method: "post", path: "/admin/billing/coverage-grants", request: json(z.object({ organizationId: z.string().uuid(), deviceIds: z.array(z.string().uuid()).min(1).max(5), endsAt: z.string().datetime({ offset: true }), reason })) }), async (c) => {
  const input = c.req.valid("json");
  return ok(c, await grantSupportCoverage(c.get("user").id, input.organizationId, input.deviceIds, new Date(input.endsAt), input.reason));
});

routes.openapi(createRoute({ ...base, method: "get", path: "/admin/billing/families/{organizationId}", request: { params: z.object({ organizationId: z.string().uuid() }) } }), async (c) => ok(c, await familyBillingDetail(c.req.valid("param").organizationId)));

routes.openapi(createRoute({ ...base, method: "post", path: "/admin/billing/warranty-replacements", request: json(z.object({ organizationId: z.string().uuid(), oldDeviceId: z.string().uuid(), newDeviceId: z.string().uuid(), reason })) }), async (c) => { const input = c.req.valid("json"); return ok(c, await replaceWarrantyDevice(c.get("user").id, input.organizationId, input.oldDeviceId, input.newDeviceId, input.reason)); });
routes.openapi(createRoute({ ...base, method: "post", path: "/admin/billing/ownership-release", request: json(z.object({ deviceId: z.string().uuid(), reason })) }), async (c) => { const input = c.req.valid("json"); return ok(c, await releaseOwnedDevice(c.get("user").id, input.deviceId, input.reason)); });

routes.openapi(createRoute({ ...base, method: "get", path: "/admin/billing/review-queue" }), async (c) => {
  const [events, failedCharges, staleCheckouts] = await Promise.all([
    db.select({ id: billingProviderEvents.id, state: billingProviderEvents.state, attempts: billingProviderEvents.attempts, lastError: billingProviderEvents.lastError, receivedAt: billingProviderEvents.receivedAt }).from(billingProviderEvents).where(eq(billingProviderEvents.state, "needs_review")).limit(100),
    // Failed charges with no retry left on a plan that is still running.
    db.select({ id: billingCharges.id, organizationId: billingCharges.organizationId, kind: billingCharges.kind, amountMinor: billingCharges.amountMinor, dueOn: billingCharges.dueOn, failureReason: billingCharges.failureReason }).from(billingCharges).innerJoin(familySubscriptions, eq(familySubscriptions.id, billingCharges.subscriptionId))
      .where(and(eq(billingCharges.status, "failed"), isNull(billingCharges.nextAttemptOn), inArray(familySubscriptions.state, ["active", "past_due", "scheduled"]))).limit(100),
    db.select({ id: billingCheckoutIntents.id, organizationId: billingCheckoutIntents.organizationId, state: billingCheckoutIntents.state, createdAt: billingCheckoutIntents.createdAt }).from(billingCheckoutIntents).where(and(eq(billingCheckoutIntents.state, "bank_pending"), lt(billingCheckoutIntents.createdAt, new Date(Date.now() - 3 * 86_400_000)))).limit(100),
  ]);
  return ok(c, { events, failedCharges, staleCheckouts });
});

routes.openapi(createRoute({ ...base, method: "post", path: "/admin/billing/events/{id}/retry", request: { params: z.object({ id: z.string().min(1).max(256) }) } }), async (c) => {
  const [event] = await db.update(billingProviderEvents).set({ state: "pending", attempts: 0, availableAt: new Date(), leaseUntil: null }).where(and(eq(billingProviderEvents.id, c.req.valid("param").id), eq(billingProviderEvents.state, "needs_review"))).returning({ id: billingProviderEvents.id });
  if (!event) throw notFound("NOT_FOUND", "Review event not found.");
  return ok(c, { queued: true });
});

export { routes as billingAdminRoutes };
