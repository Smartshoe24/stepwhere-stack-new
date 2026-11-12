import { createRoute, z } from "@hono/zod-openapi";

import type { AppBindings } from "../../app-types";
import { createOpenApiApp } from "../../openapi/create-app";
import { errorResponses, jsonDataResponse } from "../../openapi/responses";
import { ActiveSubscriptionSchema, PlanSchema } from "../../openapi/schemas";
import { bearerSecurity } from "../../openapi/security";
import { ok } from "../../shared/http";
import { getChildForOrganization } from "../children/children.service";
import { getActiveSubscriptionForChild, listActivePlans } from "./plans.service";

const paramsSchema = z.object({
  childId: z.string().uuid().openapi({
    param: {
      name: "childId",
      in: "path",
    },
  }),
});

const listPlansRoute = createRoute({
  method: "get",
  path: "/plans",
  tags: ["Plans"],
  security: bearerSecurity,
  responses: {
    200: jsonDataResponse(z.array(PlanSchema), "Active plans."),
    ...errorResponses([401]),
  },
});

const childSubscriptionRoute = createRoute({
  method: "get",
  path: "/children/{childId}/subscription",
  tags: ["Plans"],
  security: bearerSecurity,
  request: {
    params: paramsSchema,
  },
  responses: {
    200: jsonDataResponse(ActiveSubscriptionSchema.nullable(), "Child subscription."),
    ...errorResponses([400, 401, 404]),
  },
});

const plansRoutes = createOpenApiApp();

plansRoutes.openapi(listPlansRoute, async (c) => ok(c, await listActivePlans()));

plansRoutes.openapi(childSubscriptionRoute, async (c) => {
  const organization = c.get("organization");
  const { childId } = c.req.valid("param");
  await getChildForOrganization(organization.id, childId);
  return ok(c, await getActiveSubscriptionForChild(childId));
});

export { plansRoutes };
