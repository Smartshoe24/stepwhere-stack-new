import { createRoute, z } from "@hono/zod-openapi";

import type { AppBindings } from "../../app-types";
import { createOpenApiApp } from "../../openapi/create-app";
import { errorResponses, jsonDataResponse } from "../../openapi/responses";
import { UserProfileSchema } from "../../openapi/schemas";
import { bearerSecurity } from "../../openapi/security";
import { ok } from "../../shared/http";
import { badRequest } from "../../shared/errors";
import { getUserProfile, updateUserProfile } from "./users.service";

const updateMeSchema = z.object({
  displayName: z.string().trim().min(1).optional(),
  email: z.string().email().nullable().optional(),
  avatarUrl: z.string().trim().min(1).nullable().optional(),
  currentAddress: z.string().trim().min(1).nullable().optional(),
  dateOfBirth: z.string().date().nullable().optional(),
});

const getMeRoute = createRoute({
  method: "get",
  path: "/me",
  tags: ["Users"],
  security: bearerSecurity,
  responses: {
    200: jsonDataResponse(UserProfileSchema, "Current user profile."),
    ...errorResponses([401, 404]),
  },
});

const updateMeRoute = createRoute({
  method: "patch",
  path: "/me",
  tags: ["Users"],
  security: bearerSecurity,
  request: {
    body: {
      content: {
        "application/json": {
          schema: updateMeSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    200: jsonDataResponse(UserProfileSchema, "Updated user profile."),
    ...errorResponses([400, 401, 404]),
  },
});

const usersRoutes = createOpenApiApp();

usersRoutes.openapi(getMeRoute, async (c) => {
  const user = c.get("user");
  const session = c.get("session");
  return ok(c, await getUserProfile(user.id, {
    headers: c.req.raw.headers,
    activeOrganizationId: session.activeOrganizationId ?? null,
  }));
});

usersRoutes.openapi(updateMeRoute, async (c) => {
  const user = c.get("user");
  const session = c.get("session");
  const body = c.req.valid("json");

  if ("email" in body) {
    throw badRequest("Email can only be changed by connecting a verified Google account.");
  }

  return ok(c, await updateUserProfile(user.id, body, {
    headers: c.req.raw.headers,
    activeOrganizationId: session.activeOrganizationId ?? null,
  }));
});

export { usersRoutes };
