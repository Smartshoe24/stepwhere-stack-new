import { createRoute, z } from "@hono/zod-openapi";

import type { AppBindings } from "../../app-types";
import { adminMiddleware } from "../../middlewares/admin";
import { authMiddleware } from "../../middlewares/auth";
import { createOpenApiApp } from "../../openapi/create-app";
import { errorResponses, jsonDataResponse } from "../../openapi/responses";
import { DeviceAuthResultSchema } from "../../openapi/schemas";
import { bearerSecurity, deviceSecurity } from "../../openapi/security";
import { created, ok } from "../../shared/http";
import { deviceAuthMiddleware } from "./device-auth.middleware";
import { registerDevice, rotateDeviceToken } from "./devices.service";

const registerDeviceSchema = z.object({
  hardwareIdentifier: z.string().trim().min(1),
  displayName: z.string().trim().nullable().optional(),
  platform: z.enum(["android", "ios", "embedded", "unknown"]).optional(),
});

const registerDeviceRoute = createRoute({
  method: "post",
  path: "/device-auth/register",
  tags: ["Devices"],
  security: bearerSecurity,
  middleware: [authMiddleware, adminMiddleware] as const,
  request: {
    body: {
      content: {
        "application/json": {
          schema: registerDeviceSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    201: jsonDataResponse(DeviceAuthResultSchema, "Registered a device."),
    ...errorResponses([400, 401, 409]),
  },
});

const rotateTokenRoute = createRoute({
  method: "post",
  path: "/device-auth/rotate-token",
  tags: ["Devices"],
  security: deviceSecurity,
  middleware: [deviceAuthMiddleware] as const,
  responses: {
    200: jsonDataResponse(DeviceAuthResultSchema, "Rotated device token."),
    ...errorResponses([401, 404]),
  },
});

const devicesRoutes = createOpenApiApp();

devicesRoutes.openapi(registerDeviceRoute, async (c) => {
  const body = c.req.valid("json");
  return created(c, await registerDevice(body));
});

devicesRoutes.openapi(rotateTokenRoute, async (c) => {
  const device = c.get("device");
  return ok(c, await rotateDeviceToken(device.id));
});

export { devicesRoutes };
