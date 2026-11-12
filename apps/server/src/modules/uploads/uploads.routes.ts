import { createRoute, z } from "@hono/zod-openapi";

import { createOpenApiApp } from "../../openapi/create-app";
import { errorResponses, jsonDataResponse } from "../../openapi/responses";
import { ChildAvatarUploadIntentSchema, UserAvatarUploadIntentSchema } from "../../openapi/schemas";
import { bearerSecurity } from "../../openapi/security";
import { created } from "../../shared/http";
import { ensureActiveFamilyForUser } from "../family/family.service";
import { createChildAvatarUploadIntent, createUserAvatarUploadIntent } from "./uploads.service";

const createAvatarUploadIntentSchema = z.object({
  fileName: z.string().trim().min(1),
  contentType: z.string().trim().min(1),
  fileSize: z.number().int().positive(),
});

const createChildAvatarUploadIntentRoute = createRoute({
  method: "post",
  path: "/uploads/child-avatar-intents",
  tags: ["Uploads"],
  security: bearerSecurity,
  request: {
    body: {
      content: {
        "application/json": {
          schema: createAvatarUploadIntentSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    201: jsonDataResponse(ChildAvatarUploadIntentSchema, "Created child avatar upload intent."),
    ...errorResponses([400, 401, 409]),
  },
});

const createUserAvatarUploadIntentRoute = createRoute({
  method: "post",
  path: "/uploads/user-avatar-intents",
  tags: ["Uploads"],
  security: bearerSecurity,
  request: {
    body: {
      content: {
        "application/json": {
          schema: createAvatarUploadIntentSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    201: jsonDataResponse(UserAvatarUploadIntentSchema, "Created user avatar upload intent."),
    ...errorResponses([400, 401, 409]),
  },
});

const uploadsRoutes = createOpenApiApp();

uploadsRoutes.openapi(createUserAvatarUploadIntentRoute, async (c) => {
  const user = c.get("user");
  const body = c.req.valid("json");
  return created(c, await createUserAvatarUploadIntent({
    userId: user.id,
    file: body,
  }));
});

uploadsRoutes.openapi(createChildAvatarUploadIntentRoute, async (c) => {
  const user = c.get("user");
  const session = c.get("session");
  const membership = await ensureActiveFamilyForUser({
    userId: user.id,
    headers: c.req.raw.headers,
    activeOrganizationId: session.activeOrganizationId ?? null,
  });

  const body = c.req.valid("json");
  return created(c, await createChildAvatarUploadIntent({
    organizationId: membership.organization.id,
    userId: user.id,
    file: body,
  }));
});

export { uploadsRoutes };
