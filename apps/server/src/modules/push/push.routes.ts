import { createRoute, z } from "@hono/zod-openapi";

import { createOpenApiApp } from "../../openapi/create-app";
import { errorResponses, jsonDataResponse } from "../../openapi/responses";
import { PushInstallationSchema, UuidSchema } from "../../openapi/schemas";
import { bearerSecurity } from "../../openapi/security";
import { ok } from "../../shared/http";
import { badRequest } from "../../shared/errors";
import { registerPushInstallation, deletePushInstallation } from "./push-installations.service";
import { Expo } from "expo-server-sdk";

const installationParamsSchema = z.object({
  installationId: z.string().trim().min(1).openapi({
    param: {
      name: "installationId",
      in: "path",
    },
  }),
});

const registerPushInstallationRoute = createRoute({
  method: "put",
  path: "/me/push-installations/current",
  tags: ["Push"],
  security: bearerSecurity,
  request: {
    body: {
      content: {
        "application/json": {
          schema: PushInstallationSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    200: jsonDataResponse(PushInstallationSchema, "Registered current push installation."),
    ...errorResponses([400, 401]),
  },
});

const deletePushInstallationRoute = createRoute({
  method: "delete",
  path: "/me/push-installations/{installationId}",
  tags: ["Push"],
  security: bearerSecurity,
  request: {
    params: installationParamsSchema,
  },
  responses: {
    200: jsonDataResponse(
      z.object({
        installationId: z.string(),
        deleted: z.boolean(),
      }),
      "Deleted push installation.",
    ),
    ...errorResponses([400, 401]),
  },
});

const pushRoutes = createOpenApiApp();

pushRoutes.openapi(registerPushInstallationRoute, async (c) => {
  const user = c.get("user");
  const session = c.get("session");
  const body = c.req.valid("json");

  if (!Expo.isExpoPushToken(body.expoPushToken)) {
    throw badRequest("Invalid Expo push token.");
  }

  await registerPushInstallation({
    userId: user.id,
    sessionId: session.id ?? null,
    values: body,
  });

  return ok(c, body);
});

pushRoutes.openapi(deletePushInstallationRoute, async (c) => {
  const user = c.get("user");
  const { installationId } = c.req.valid("param");
  await deletePushInstallation({
    userId: user.id,
    installationId,
  });

  return ok(c, {
    installationId,
    deleted: true,
  });
});

export { pushRoutes };
