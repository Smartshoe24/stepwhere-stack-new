import { createRoute, z } from "@hono/zod-openapi";

import { createOpenApiApp } from "../../openapi/create-app";
import { ChildHistoryDayResponseSchema, ChildHistoryRangeResponseSchema, DateSchema, UuidSchema } from "../../openapi/schemas";
import { errorResponses, jsonDataResponse } from "../../openapi/responses";
import { bearerSecurity } from "../../openapi/security";
import { ok } from "../../shared/http";
import { getChildHistoryDayForOrganization, getChildHistoryRangeForOrganization } from "./history.service";

const childParamsSchema = z.object({
  childId: UuidSchema.openapi({
    param: {
      name: "childId",
      in: "path",
    },
  }),
});

const timezoneQuerySchema = z.object({
  timezone: z.string().min(1).openapi({
    param: {
      name: "timezone",
      in: "query",
    },
  }),
});

const dayQuerySchema = timezoneQuerySchema.extend({
  date: DateSchema.openapi({
    param: {
      name: "date",
      in: "query",
    },
  }),
});

const getHistoryRangeRoute = createRoute({
  method: "get",
  path: "/children/{childId}/history/range",
  tags: ["History"],
  security: bearerSecurity,
  request: {
    params: childParamsSchema,
    query: timezoneQuerySchema,
  },
  responses: {
    200: jsonDataResponse(ChildHistoryRangeResponseSchema, "Child History date range."),
    ...errorResponses([400, 401, 404, 409]),
  },
});

const getHistoryDayRoute = createRoute({
  method: "get",
  path: "/children/{childId}/history/day",
  tags: ["History"],
  security: bearerSecurity,
  request: {
    params: childParamsSchema,
    query: dayQuerySchema,
  },
  responses: {
    200: jsonDataResponse(ChildHistoryDayResponseSchema, "Child History day."),
    ...errorResponses([400, 401, 404, 409]),
  },
});

const legacyGetHistoryDayRoute = createRoute({
  method: "get",
  path: "/children/{childId}/history",
  tags: ["History"],
  deprecated: true,
  security: bearerSecurity,
  request: {
    params: childParamsSchema,
    query: dayQuerySchema,
  },
  responses: {
    200: jsonDataResponse(
      ChildHistoryDayResponseSchema,
      "Child History day. Use /children/{childId}/history/day for new clients.",
    ),
    ...errorResponses([400, 401, 404, 409]),
  },
});

const historyRoutes = createOpenApiApp();

historyRoutes.openapi(getHistoryRangeRoute, async (c) => {
  const organization = c.get("organization");
  const { childId } = c.req.valid("param");
  const query = c.req.valid("query");

  return ok(c, await getChildHistoryRangeForOrganization(organization.id, childId, query.timezone));
});

historyRoutes.openapi(getHistoryDayRoute, async (c) => {
  const organization = c.get("organization");
  const { childId } = c.req.valid("param");
  const query = c.req.valid("query");

  return ok(c, await getChildHistoryDayForOrganization(organization.id, childId, query));
});

historyRoutes.openapi(legacyGetHistoryDayRoute, async (c) => {
  const organization = c.get("organization");
  const { childId } = c.req.valid("param");
  const query = c.req.valid("query");

  return ok(c, await getChildHistoryDayForOrganization(organization.id, childId, query));
});

export { historyRoutes };
