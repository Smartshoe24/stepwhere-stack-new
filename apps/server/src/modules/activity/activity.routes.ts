import { createRoute, z } from "@hono/zod-openapi";

import { createOpenApiApp } from "../../openapi/create-app";
import { errorResponses, jsonDataResponse } from "../../openapi/responses";
import { ChildActivityResponseSchema, DateSchema, UuidSchema } from "../../openapi/schemas";
import { bearerSecurity } from "../../openapi/security";
import { ok } from "../../shared/http";
import { getChildActivityForOrganization } from "./activity.service";

const activityParamsSchema = z.object({
  childId: UuidSchema.openapi({
    param: {
      name: "childId",
      in: "path",
    },
  }),
});

const activityQuerySchema = z.object({
  period: z.enum(["day", "week", "month", "year"]).openapi({
    param: {
      name: "period",
      in: "query",
    },
  }),
  startDate: DateSchema.openapi({
    param: {
      name: "startDate",
      in: "query",
    },
  }),
  endDate: DateSchema.openapi({
    param: {
      name: "endDate",
      in: "query",
    },
  }),
  timezone: z.string().min(1).openapi({
    param: {
      name: "timezone",
      in: "query",
    },
  }),
});

const getChildActivityRoute = createRoute({
  method: "get",
  path: "/children/{childId}/activity",
  tags: ["Activity"],
  security: bearerSecurity,
  request: {
    params: activityParamsSchema,
    query: activityQuerySchema,
  },
  responses: {
    200: jsonDataResponse(ChildActivityResponseSchema, "Child activity summary."),
    ...errorResponses([400, 401, 404, 409]),
  },
});

const activityRoutes = createOpenApiApp();

activityRoutes.openapi(getChildActivityRoute, async (c) => {
  const organization = c.get("organization");
  const { childId } = c.req.valid("param");
  const query = c.req.valid("query");

  return ok(c, await getChildActivityForOrganization(organization.id, childId, query));
});

export { activityRoutes };
