import { createRoute, z } from "@hono/zod-openapi";

import { createOpenApiApp } from "../../openapi/create-app";
import { errorResponses, jsonDataResponse } from "../../openapi/responses";
import {
  ArchiveChildResultSchema,
  BindChildDeviceResultSchema,
  ChildDetailSchema,
  ChildGeofenceSchema,
  OverviewResponseSchema,
  UnlinkChildDeviceResultSchema,
  UuidSchema,
} from "../../openapi/schemas";
import { bearerSecurity } from "../../openapi/security";
import { familyAdminMiddleware } from "../family/family.middleware";
import { created, ok } from "../../shared/http";
import { realtimeRegistry } from "../realtime/realtime.service";
import { adminRealtimeRegistry } from "../admin/admin-realtime.service";
import {
  archiveChildForOrganization,
  bindReservedDeviceToChild,
  createChild,
  getChildForOrganization,
  getChildGeofenceForOrganization,
  getOverviewForOrganization,
  listChildrenForOrganization,
  resetChildGeofenceForOrganization,
  unlinkChildDeviceForOrganization,
  updateChildGeofenceForOrganization,
  updateChildForOrganization,
} from "./children.service";

const childIdParamsSchema = z.object({
  childId: UuidSchema.openapi({
    param: {
      name: "childId",
      in: "path",
    },
  }),
});

const createChildSchema = z.object({
  name: z.string().trim().min(1),
  avatarUrl: z.string().trim().min(1),
  schoolPlaceId: UuidSchema,
  dateOfBirth: z.string().date(),
  deviceReservationToken: z.string().trim().min(1),
  idempotencyKey: z.string().uuid(),
});

const updateChildSchema = z.object({
  name: z.string().trim().min(1).optional(),
  avatarUrl: z.string().trim().min(1).nullable().optional(),
  dateOfBirth: z.string().date().nullable().optional(),
  schoolPlaceId: UuidSchema.optional(),
});

const updateChildGeofenceSchema = z.object({
  status: z.enum(["enabled", "disabled"]),
  centerLatitude: z.number().min(-90).max(90).nullable().optional(),
  centerLongitude: z.number().min(-180).max(180).nullable().optional(),
  radiusMeters: z.number().int().min(0).max(10000).nullable().optional(),
});

const bindChildDeviceSchema = z.object({
  deviceReservationToken: z.string().trim().min(1),
});

const getOverviewRoute = createRoute({
  method: "get",
  path: "/overview",
  tags: ["Overview"],
  security: bearerSecurity,
  responses: {
    200: jsonDataResponse(OverviewResponseSchema, "Family overview snapshot."),
    ...errorResponses([401, 409]),
  },
});

const listChildrenRoute = createRoute({
  method: "get",
  path: "/children",
  tags: ["Children"],
  security: bearerSecurity,
  responses: {
    200: jsonDataResponse(z.array(ChildDetailSchema), "Children in the current family."),
    ...errorResponses([401, 409]),
  },
});

const createChildRoute = createRoute({
  method: "post",
  path: "/children",
  tags: ["Children"],
  security: bearerSecurity,
  middleware: [familyAdminMiddleware] as const,
  request: {
    body: {
      content: {
        "application/json": {
          schema: createChildSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    201: jsonDataResponse(ChildDetailSchema, "Created child."),
    ...errorResponses([400, 401, 403, 409]),
  },
});

const getChildRoute = createRoute({
  method: "get",
  path: "/children/{childId}",
  tags: ["Children"],
  security: bearerSecurity,
  request: {
    params: childIdParamsSchema,
  },
  responses: {
    200: jsonDataResponse(ChildDetailSchema, "Child details."),
    ...errorResponses([400, 401, 404, 409]),
  },
});

const getChildGeofenceRoute = createRoute({
  method: "get",
  path: "/children/{childId}/geofence",
  tags: ["Children"],
  security: bearerSecurity,
  request: {
    params: childIdParamsSchema,
  },
  responses: {
    200: jsonDataResponse(ChildGeofenceSchema, "Child geofence settings."),
    ...errorResponses([400, 401, 404, 409]),
  },
});

const updateChildGeofenceRoute = createRoute({
  method: "patch",
  path: "/children/{childId}/geofence",
  tags: ["Children"],
  security: bearerSecurity,
  request: {
    params: childIdParamsSchema,
    body: {
      content: {
        "application/json": {
          schema: updateChildGeofenceSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    200: jsonDataResponse(ChildGeofenceSchema, "Updated child geofence."),
    ...errorResponses([400, 401, 403, 404, 409]),
  },
});

const resetChildGeofenceRoute = createRoute({
  method: "post",
  path: "/children/{childId}/geofence/reset",
  tags: ["Children"],
  security: bearerSecurity,
  request: {
    params: childIdParamsSchema,
  },
  responses: {
    200: jsonDataResponse(ChildGeofenceSchema, "Reset child geofence around the latest child location."),
    ...errorResponses([401, 403, 404, 409]),
  },
});

const updateChildRoute = createRoute({
  method: "patch",
  path: "/children/{childId}",
  tags: ["Children"],
  security: bearerSecurity,
  middleware: [familyAdminMiddleware] as const,
  request: {
    params: childIdParamsSchema,
    body: {
      content: {
        "application/json": {
          schema: updateChildSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    200: jsonDataResponse(ChildDetailSchema, "Updated child."),
    ...errorResponses([400, 401, 403, 404, 409]),
  },
});

const archiveChildRoute = createRoute({
  method: "delete",
  path: "/children/{childId}",
  tags: ["Children"],
  security: bearerSecurity,
  middleware: [familyAdminMiddleware] as const,
  request: {
    params: childIdParamsSchema,
  },
  responses: {
    200: jsonDataResponse(ArchiveChildResultSchema, "Archived child."),
    ...errorResponses([400, 401, 403, 404, 409]),
  },
});

const unlinkChildDeviceRoute = createRoute({
  method: "delete",
  path: "/children/{childId}/device-binding",
  tags: ["Children"],
  security: bearerSecurity,
  middleware: [familyAdminMiddleware] as const,
  request: {
    params: childIdParamsSchema,
  },
  responses: {
    200: jsonDataResponse(UnlinkChildDeviceResultSchema, "Unlinked child device."),
    ...errorResponses([400, 401, 403, 404, 409]),
  },
});

const bindChildDeviceRoute = createRoute({
  method: "post",
  path: "/children/{childId}/device-binding",
  tags: ["Children"],
  security: bearerSecurity,
  middleware: [familyAdminMiddleware] as const,
  request: {
    params: childIdParamsSchema,
    body: {
      content: {
        "application/json": {
          schema: bindChildDeviceSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    200: jsonDataResponse(BindChildDeviceResultSchema, "Bound device to child."),
    ...errorResponses([400, 401, 403, 404, 409]),
  },
});

const childrenRoutes = createOpenApiApp();

async function broadcastOverviewSnapshot(organizationId: string) {
  realtimeRegistry.broadcast(organizationId, {
    type: "overview.snapshot",
    data: await getOverviewForOrganization(organizationId),
  });
}

childrenRoutes.openapi(getOverviewRoute, async (c) => {
  const organization = c.get("organization");
  return ok(c, await getOverviewForOrganization(organization.id));
});

childrenRoutes.openapi(listChildrenRoute, async (c) => {
  const organization = c.get("organization");
  return ok(c, await listChildrenForOrganization(organization.id));
});

childrenRoutes.openapi(createChildRoute, async (c) => {
  const organization = c.get("organization");
  const user = c.get("user");
  const body = c.req.valid("json");
  return created(c, await createChild(organization.id, body, { userId: user.id }));
});

childrenRoutes.openapi(getChildRoute, async (c) => {
  const organization = c.get("organization");
  const { childId } = c.req.valid("param");
  return ok(c, await getChildForOrganization(organization.id, childId));
});

childrenRoutes.openapi(getChildGeofenceRoute, async (c) => {
  const organization = c.get("organization");
  const { childId } = c.req.valid("param");
  return ok(c, await getChildGeofenceForOrganization(organization.id, childId));
});

childrenRoutes.openapi(updateChildRoute, async (c) => {
  const organization = c.get("organization");
  const user = c.get("user");
  const { childId } = c.req.valid("param");
  const body = c.req.valid("json");
  const child = await updateChildForOrganization(organization.id, childId, body, { userId: user.id });
  adminRealtimeRegistry.broadcast({
    type: "admin:child.updated",
    data: {
      childId,
      reason: "child_updated",
    },
  });
  return ok(c, child);
});

childrenRoutes.openapi(updateChildGeofenceRoute, async (c) => {
  const organization = c.get("organization");
  const { childId } = c.req.valid("param");
  const body = c.req.valid("json");
  const geofence = await updateChildGeofenceForOrganization(organization.id, childId, body);
  await broadcastOverviewSnapshot(organization.id);
  adminRealtimeRegistry.broadcast({
    type: "admin:geofence.changed",
    data: {
      childId,
      reason: "geofence_updated",
    },
  });
  return ok(c, geofence);
});

childrenRoutes.openapi(resetChildGeofenceRoute, async (c) => {
  const organization = c.get("organization");
  const { childId } = c.req.valid("param");
  const geofence = await resetChildGeofenceForOrganization(organization.id, childId);

  await broadcastOverviewSnapshot(organization.id);
  adminRealtimeRegistry.broadcast({
    type: "admin:geofence.changed",
    data: {
      childId,
      reason: "geofence_reset",
    },
  });

  return ok(c, geofence);
});

childrenRoutes.openapi(archiveChildRoute, async (c) => {
  const organization = c.get("organization");
  const { childId } = c.req.valid("param");
  return ok(c, await archiveChildForOrganization(organization.id, childId));
});

childrenRoutes.openapi(unlinkChildDeviceRoute, async (c) => {
  const organization = c.get("organization");
  const { childId } = c.req.valid("param");
  return ok(c, await unlinkChildDeviceForOrganization(organization.id, childId));
});

childrenRoutes.openapi(bindChildDeviceRoute, async (c) => {
  const organization = c.get("organization");
  const user = c.get("user");
  const { childId } = c.req.valid("param");
  const body = c.req.valid("json");
  return ok(c, await bindReservedDeviceToChild({
    organizationId: organization.id,
    userId: user.id,
    childId,
    deviceReservationToken: body.deviceReservationToken,
  }));
});

export { childrenRoutes };
