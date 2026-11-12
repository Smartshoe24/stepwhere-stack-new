import { createRoute, z } from "@hono/zod-openapi";

import { createOpenApiApp } from "../../openapi/create-app";
import {
  CreatePreviewAccessEntryInputSchema,
  PreviewAccessEntrySchema,
  PreviewAccessStateSchema,
  UpdatePreviewAccessEntryInputSchema,
  UuidSchema,
} from "../../openapi/schemas";
import { errorResponses, jsonDataResponse } from "../../openapi/responses";
import { bearerSecurity } from "../../openapi/security";
import { created, ok } from "../../shared/http";
import {
  createPreviewAccessEntry,
  deletePreviewAccessEntry,
  listPreviewAccess,
  updatePreviewAccessEntry,
} from "../preview-access/preview-access.service";

function pathUuidParam(name: string) {
  return UuidSchema.openapi({
    param: { name, in: "path" },
  });
}

const entryParamsSchema = z.object({
  entryId: pathUuidParam("entryId"),
});

const listRoute = createRoute({
  method: "get",
  path: "/admin/preview-access",
  tags: ["Admin", "Preview access"],
  security: bearerSecurity,
  responses: {
    200: jsonDataResponse(PreviewAccessStateSchema, "Preview access configuration."),
    ...errorResponses([401, 403]),
  },
});

const createRouteDefinition = createRoute({
  method: "post",
  path: "/admin/preview-access",
  tags: ["Admin", "Preview access"],
  security: bearerSecurity,
  request: {
    body: {
      content: {
        "application/json": { schema: CreatePreviewAccessEntryInputSchema },
      },
      required: true,
    },
  },
  responses: {
    201: jsonDataResponse(PreviewAccessEntrySchema, "Preview access entry created."),
    ...errorResponses([400, 401, 403, 409]),
  },
});

const updateRoute = createRoute({
  method: "patch",
  path: "/admin/preview-access/{entryId}",
  tags: ["Admin", "Preview access"],
  security: bearerSecurity,
  request: {
    params: entryParamsSchema,
    body: {
      content: {
        "application/json": { schema: UpdatePreviewAccessEntryInputSchema },
      },
      required: true,
    },
  },
  responses: {
    200: jsonDataResponse(PreviewAccessEntrySchema, "Preview access entry updated."),
    ...errorResponses([400, 401, 403, 404]),
  },
});

const deleteRoute = createRoute({
  method: "delete",
  path: "/admin/preview-access/{entryId}",
  tags: ["Admin", "Preview access"],
  security: bearerSecurity,
  request: { params: entryParamsSchema },
  responses: {
    200: jsonDataResponse(PreviewAccessEntrySchema, "Preview access entry deleted."),
    ...errorResponses([401, 403, 404]),
  },
});

const adminPreviewAccessRoutes = createOpenApiApp();

adminPreviewAccessRoutes.openapi(listRoute, async (c) => ok(c, await listPreviewAccess()));

adminPreviewAccessRoutes.openapi(createRouteDefinition, async (c) => {
  const user = c.get("user");
  return created(c, await createPreviewAccessEntry(c.req.valid("json"), user.id));
});

adminPreviewAccessRoutes.openapi(updateRoute, async (c) => {
  const { entryId } = c.req.valid("param");
  return ok(c, await updatePreviewAccessEntry(entryId, c.req.valid("json")));
});

adminPreviewAccessRoutes.openapi(deleteRoute, async (c) => {
  const { entryId } = c.req.valid("param");
  return ok(c, await deletePreviewAccessEntry(entryId));
});

export { adminPreviewAccessRoutes };
