import { Scalar } from "@scalar/hono-api-reference";
import type { OpenAPIHono } from "@hono/zod-openapi";

import type { AppBindings } from "../app-types";
import { env } from "../config/env";
import { securitySchemes } from "./security";

export function registerOpenApiDocs(app: OpenAPIHono<AppBindings>) {
  if (!shouldExposeApiReference()) {
    return;
  }

  app.openAPIRegistry.registerComponent("securitySchemes", "bearerAuth", securitySchemes.bearerAuth);
  app.openAPIRegistry.registerComponent("securitySchemes", "deviceAuth", securitySchemes.deviceAuth);
  app.openAPIRegistry.registerComponent("securitySchemes", "deviceIngestKey", securitySchemes.deviceIngestKey);
  app.openAPIRegistry.registerComponent("securitySchemes", "provisioningSecret", securitySchemes.provisioningSecret);

  app.doc("/openapi.json", {
    openapi: "3.0.0",
    info: {
      title: "Stepwhere API",
      version: "1.0.0",
      description: "Mobile MVP API for Stepwhere.",
    },
    servers: [
      {
        url: env.BETTER_AUTH_URL,
        description: "Current server",
      },
    ],
    tags: [
      { name: "Auth" },
      { name: "Onboarding" },
      { name: "Family" },
      { name: "Users" },
      { name: "Children" },
      { name: "Devices" },
      { name: "Telemetry" },
      { name: "Realtime" },
      { name: "Plans" },
      { name: "Notifications" },
      { name: "CMS" },
      { name: "Shares" },
      { name: "Admin" },
    ],
  });

  app.get("/reference", Scalar({
    url: "/openapi.json",
    pageTitle: "Stepwhere API Reference",
    theme: "default",
  }));
}

export function shouldExposeApiReference(config = env) {
  return config.NODE_ENV !== "production" || config.ENABLE_API_REFERENCE;
}
