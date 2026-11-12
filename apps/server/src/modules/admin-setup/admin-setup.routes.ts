import { createRoute, z } from "@hono/zod-openapi";

import { createOpenApiApp } from "../../openapi/create-app";
import { errorResponses, jsonDataResponse } from "../../openapi/responses";
import { ok } from "../../shared/http";
import {
  ADMIN_SETUP_MAX_PASSWORD_LENGTH,
  completeAdminSetup,
  getAdminSetupStatus,
} from "./admin-setup.service";

const AdminSetupStatusSchema = z.object({
  required: z.boolean(),
  email: z.string().email(),
}).openapi("AdminSetupStatus");

const AdminSetupResultSchema = z.object({
  email: z.string().email(),
}).openapi("AdminSetupResult");

// Length policy is enforced in the service, after the "setup closed" and
// setup-code checks, so a closed setup always answers 404.
const completeAdminSetupSchema = z.object({
  password: z.string().max(ADMIN_SETUP_MAX_PASSWORD_LENGTH * 4).openapi({
    description: "New password for the initial admin. At least 12 characters.",
  }),
  setupCode: z.string().max(512).openapi({
    description: "One-time code from ADMIN_SETUP_CODE.",
  }),
}).openapi("CompleteAdminSetupInput");

const getAdminSetupRoute = createRoute({
  method: "get",
  path: "/admin/setup",
  tags: ["Admin setup"],
  description: "Public. Whether the first-run admin setup is still open.",
  responses: {
    200: jsonDataResponse(AdminSetupStatusSchema, "Admin setup status."),
  },
});

const completeAdminSetupRoute = createRoute({
  method: "post",
  path: "/admin/setup",
  tags: ["Admin setup"],
  description: "Public. Sets the initial admin password once. Answers 404 once any admin exists or when ADMIN_SETUP_CODE is unset.",
  request: {
    body: {
      content: {
        "application/json": {
          schema: completeAdminSetupSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    200: jsonDataResponse(AdminSetupResultSchema, "Initial admin created."),
    ...errorResponses([400, 403, 404, 409, 429]),
  },
});

function toClientKey(headers: Headers) {
  const forwardedFor = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwardedFor || headers.get("x-real-ip")?.trim() || "unknown";
}

const adminSetupRoutes = createOpenApiApp();

adminSetupRoutes.openapi(getAdminSetupRoute, async (c) => {
  c.header("cache-control", "no-store");
  return ok(c, await getAdminSetupStatus());
});

adminSetupRoutes.openapi(completeAdminSetupRoute, async (c) => {
  const body = c.req.valid("json");
  c.header("cache-control", "no-store");
  return ok(c, await completeAdminSetup({
    password: body.password,
    setupCode: body.setupCode,
    clientKey: toClientKey(c.req.raw.headers),
  }));
});

export { adminSetupRoutes };
