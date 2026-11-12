import { createRoute, z } from "@hono/zod-openapi";

import { createOpenApiApp } from "../../openapi/create-app";
import { errorResponses, jsonDataResponse } from "../../openapi/responses";
import { bearerSecurity } from "../../openapi/security";
import { created, ok } from "../../shared/http";
import {
  confirmAccountDeletion,
  createAccountDeletionChallenge,
  getAccountDeletionImpact,
} from "./account-deletion.service";

const impactSchema = z.object({
  childCount: z.number().int().nonnegative(),
  familyMemberCount: z.number().int().nonnegative(),
  familyName: z.string().nullable(),
  isFamilyAdmin: z.boolean(),
  scope: z.enum(["user_only", "family"]),
  shoeCount: z.number().int().nonnegative(),
  trackingStops: z.boolean(),
  willTransferAdmin: z.boolean(),
}).openapi("AccountDeletionImpact");

const challengeSchema = z.object({
  challengeToken: z.string(),
  expiresAt: z.string().datetime(),
  impact: impactSchema,
  phoneNumber: z.string(),
  resendAvailableAt: z.string().datetime(),
}).openapi("AccountDeletionChallenge");

const confirmationSchema = z.object({
  adminTransferred: z.boolean(),
  purgeBy: z.string().datetime(),
  requestedAt: z.string().datetime(),
  scope: z.enum(["user_only", "family"]),
  trackingStopped: z.boolean(),
  undoUntil: z.string().datetime(),
}).openapi("AccountDeletionConfirmation");

const confirmInputSchema = z.object({
  challengeToken: z.string().trim().min(1),
  code: z.string().trim().regex(/^[0-9]{6}$/),
});

const impactRoute = createRoute({
  method: "get",
  path: "/me/account-deletion/impact",
  tags: ["Account deletion"],
  security: bearerSecurity,
  responses: {
    200: jsonDataResponse(impactSchema, "Account-deletion impact."),
    ...errorResponses([401, 403, 404]),
  },
});

const challengeRoute = createRoute({
  method: "post",
  path: "/me/account-deletion/challenges",
  tags: ["Account deletion"],
  security: bearerSecurity,
  responses: {
    201: jsonDataResponse(challengeSchema, "Account-deletion challenge created."),
    ...errorResponses([401, 403, 404, 409]),
  },
});

const confirmRoute = createRoute({
  method: "post",
  path: "/me/account-deletion/confirm",
  tags: ["Account deletion"],
  security: bearerSecurity,
  request: {
    body: {
      content: {
        "application/json": { schema: confirmInputSchema },
      },
      required: true,
    },
  },
  responses: {
    200: jsonDataResponse(confirmationSchema, "Account deletion scheduled."),
    ...errorResponses([400, 401, 403, 404, 409, 410]),
  },
});

const accountDeletionRoutes = createOpenApiApp();

accountDeletionRoutes.openapi(impactRoute, async (c) => {
  return ok(c, await getAccountDeletionImpact(c.get("user").id));
});

accountDeletionRoutes.openapi(challengeRoute, async (c) => {
  return created(c, await createAccountDeletionChallenge({
    headers: c.req.raw.headers,
    userId: c.get("user").id,
  }));
});

accountDeletionRoutes.openapi(confirmRoute, async (c) => {
  return ok(c, await confirmAccountDeletion({
    body: c.req.valid("json"),
    userId: c.get("user").id,
  }));
});

export { accountDeletionRoutes };
