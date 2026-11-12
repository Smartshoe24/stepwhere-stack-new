import { and, desc, eq } from "drizzle-orm";
import { createRoute, z } from "@hono/zod-openapi";

import type { AppBindings } from "../../app-types";
import { db } from "../../db/client";
import {
  childPlanSubscriptions,
  cmsPages,
  notifications,
  plans,
} from "../../db/schema";
import { createOpenApiApp } from "../../openapi/create-app";
import { errorResponses, jsonDataResponse } from "../../openapi/responses";
import {
  AdminAddFamilyMemberInputSchema,
  AdminAcknowledgeGeofenceBreachInputSchema,
  AdminBulkAcknowledgeGeofenceBreachesInputSchema,
  AdminBanUserInputSchema,
  AdminCreateFamilyInputSchema,
  AdminCreateChildForUserInputSchema,
  AdminBulkCreateDeviceInputSchema,
  AdminBulkCreateDeviceResultSchema,
  AdminChildDetailSchema,
  AdminDeviceDetailSchema,
  AdminDeviceLiveTelemetrySchema,
  AdminDeviceSchema,
  AdminGeofenceBreachCountsSchema,
  AdminGeofenceEventSchema,
  AdminPlanRecordSchema,
  AdminLocationEventListResponseSchema,
  AdminGeofenceSchema,
  PaginatedAdminGeofenceEventsSchema,
  PaginatedAdminGeofencesSchema,
  AdminSubscriptionRecordSchema,
  AdminTransferFamilyAdminInputSchema,
  AdminUnbanUserInputSchema,
  AdminUpdateChildInputSchema,
  AdminUpdateUserInputSchema,
  AdminFamilyDetailSchema,
  AdminUserDetailSchema,
  ChildActivityResponseSchema,
  ChildTrailResponseSchema,
  CmsPageSchema,
  DateSchema,
  DeviceBindResultSchema,
  DeviceUnbindResultSchema,
  NotificationSchema,
  PaginatedAdminChildrenSchema,
  PaginatedAdminDevicesSchema,
  PaginatedAdminFamiliesSchema,
  PaginatedAdminUsersSchema,
  UserProfileSchema,
  UuidSchema,
} from "../../openapi/schemas";
import { bearerSecurity } from "../../openapi/security";
import { isAppError } from "../../shared/errors";
import { created, ok } from "../../shared/http";
import { getAdminChildById, listAdminChildren, updateAdminChild } from "./admin-children.service";
import { adminRealtimeRegistry } from "./admin-realtime.service";
import {
  acknowledgeAdminGeofenceBreach,
  acknowledgeAdminGeofenceBreaches,
  getAdminGeofenceBreachCounts,
  getAdminGeofenceById,
  listAdminGeofenceBreaches,
  listAdminGeofenceEvents,
  listAdminGeofences,
} from "./admin-geofences.service";
import {
  getAdminChildActivity,
  getAdminChildTrail,
  getAdminDeviceLiveTelemetry,
  listAdminChildLocationEvents,
  listAdminDeviceLocationEvents,
} from "./admin-telemetry.service";
import {
  addAdminFamilyMember,
  createAdminFamily,
  createFamilyJoinCode,
  getAdminFamilyById,
  listAdminFamilies,
  revokeFamilyJoinCode,
  transferAdminFamilyAdmin,
} from "../family/family.service";
import {
  bindDevice,
  bulkCreateDevices,
  createDevice,
  getAdminDeviceById,
  listAdminDevices,
  unbindDevice,
  updateDevice,
} from "../devices/devices.service";
import { banAdminUser, createAdminChildForUser, getAdminUserById, listAdminUsers, unbanAdminUser, updateAdminUser } from "../users/users.service";

function pathUuidParam(name: string) {
  return UuidSchema.openapi({
    param: {
      name,
      in: "path",
    },
  });
}

const userParamsSchema = z.object({ userId: pathUuidParam("userId") });
const childParamsSchema = z.object({ childId: pathUuidParam("childId") });
const deviceParamsSchema = z.object({ deviceId: pathUuidParam("deviceId") });
const familyParamsSchema = z.object({ familyId: pathUuidParam("familyId") });
const planParamsSchema = z.object({ planId: pathUuidParam("planId") });
const subscriptionParamsSchema = z.object({ subscriptionId: pathUuidParam("subscriptionId") });
const cmsPageParamsSchema = z.object({ pageId: pathUuidParam("pageId") });
const notificationParamsSchema = z.object({ notificationId: pathUuidParam("notificationId") });
const joinCodeParamsSchema = z.object({
  familyId: pathUuidParam("familyId"),
  joinCodeId: pathUuidParam("joinCodeId"),
});

const deviceSchema = z.object({
  hardwareIdentifier: z.string().trim().min(1).optional(),
  displayName: z.string().trim().nullable().optional(),
  platform: z.enum(["android", "ios", "embedded", "unknown"]).optional(),
  status: z.enum(["fresh", "active", "inactive", "blocked"]).optional(),
});

const createDeviceSchema = deviceSchema.extend({
  hardwareIdentifier: z.string().trim().min(1),
});

const bindDeviceSchema = z.object({
  childId: UuidSchema,
});

const planSchema = z.object({
  title: z.string().trim().min(1),
  description: z.string().trim().nullable().optional(),
  durationMonths: z.number().int().positive(),
  amountMinor: z.number().int().nullable().optional(),
  currencyCode: z.string().trim().nullable().optional(),
  status: z.enum(["active", "inactive"]).optional(),
});

const subscriptionSchema = z.object({
  planId: UuidSchema,
  source: z.enum(["admin", "purchase", "promo"]).optional(),
  externalOrderId: z.string().trim().nullable().optional(),
  externalPurchaseId: z.string().trim().nullable().optional(),
  status: z.enum(["active", "expired", "cancelled"]).optional(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
});

const cmsSchema = z.object({
  slug: z.string().trim().min(1),
  title: z.string().trim().min(1),
  body: z.string().min(1),
  status: z.enum(["draft", "active", "archived"]).optional(),
});

const notificationSchema = z.object({
  title: z.string().trim().min(1),
  body: z.string().min(1),
  imageUrl: z.string().url().nullable().optional(),
  targetRole: z.string().trim().nullable().optional(),
  targetUserId: UuidSchema.nullable().optional(),
  status: z.enum(["draft", "active", "archived"]).optional(),
  publishedAt: z.string().datetime().nullable().optional(),
});

const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  search: z.string().trim().optional(),
  sort: z.string().trim().optional(),
  dir: z.enum(["asc", "desc"]).optional(),
});

const listUsersQuerySchema = paginationQuerySchema.extend({
  role: z.enum(["user", "admin"]).optional(),
  status: z.enum(["active", "suspended"]).optional(),
  banned: z.enum(["true", "false"]).optional(),
  onboarding: z.enum(["completed", "incomplete"]).optional(),
});

const listChildrenQuerySchema = paginationQuerySchema.extend({
  lifecycleStatus: z.enum(["active", "archived"]).optional(),
  trackingStatus: z.enum(["safe", "transit", "alert", "offline"]).optional(),
  telemetryState: z.enum(["active", "sleep", "offline", "connecting"]).optional(),
  binding: z.enum(["bound", "unbound"]).optional(),
});

const listDevicesQuerySchema = paginationQuerySchema.extend({
  status: z.enum(["fresh", "active", "inactive", "blocked"]).optional(),
  platform: z.enum(["android", "ios", "embedded", "unknown"]).optional(),
  binding: z.enum(["bound", "unbound"]).optional(),
  connection: z.enum(["connected", "stale", "offline", "sleep", "never"]).optional(),
});

const listFamiliesQuerySchema = paginationQuerySchema;

const locationEventsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  startDate: DateSchema.optional(),
  endDate: DateSchema.optional(),
});

const geofenceEventsQuerySchema = locationEventsQuerySchema.extend({
  eventType: z.enum(["breached", "reentered", "reset"]).optional(),
});

const trailQuerySchema = z.object({
  distanceMeters: z.coerce.number().int().positive().max(10_000).default(2_000).optional(),
  geometry: z.enum(["filtered", "roads"]).default("roads").optional(),
});

const activityQuerySchema = z.object({
  period: z.enum(["day", "week", "month", "year"]),
  startDate: DateSchema,
  endDate: DateSchema,
  timezone: z.string().min(1),
});

const listGeofencesQuerySchema = paginationQuerySchema.extend({
  status: z.enum(["unset", "enabled", "disabled"]).optional(),
  containmentState: z.enum(["unknown", "inside", "outside"]).optional(),
  breachState: z.enum(["clear", "breached"]).optional(),
  childId: UuidSchema.optional(),
  familyId: UuidSchema.optional(),
});

const listGeofenceBreachesQuerySchema = paginationQuerySchema.extend({
  acknowledged: z.enum(["true", "false"]).optional(),
  childId: UuidSchema.optional(),
  deviceId: UuidSchema.optional(),
  familyId: UuidSchema.optional(),
  startDate: DateSchema.optional(),
  endDate: DateSchema.optional(),
});

const listUsersRoute = createRoute({
  method: "get",
  path: "/admin/users",
  tags: ["Admin"],
  security: bearerSecurity,
  summary: "List users",
  request: {
    query: listUsersQuerySchema,
  },
  responses: {
    200: jsonDataResponse(PaginatedAdminUsersSchema, "Paginated users."),
    ...errorResponses([401, 403]),
  },
});

const getUserRoute = createRoute({
  method: "get",
  path: "/admin/users/{userId}",
  tags: ["Admin"],
  security: bearerSecurity,
  summary: "Get user",
  request: { params: userParamsSchema },
  responses: {
    200: jsonDataResponse(AdminUserDetailSchema.nullable(), "Single user."),
    ...errorResponses([400, 401, 403]),
  },
});

const updateUserRoute = createRoute({
  method: "patch",
  path: "/admin/users/{userId}",
  tags: ["Admin"],
  security: bearerSecurity,
  summary: "Update user role or status",
  request: {
    params: userParamsSchema,
    body: {
      content: {
        "application/json": {
          schema: AdminUpdateUserInputSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    200: jsonDataResponse(UserProfileSchema, "Updated user."),
    ...errorResponses([400, 401, 403, 404]),
  },
});

const createUserChildRoute = createRoute({
  method: "post",
  path: "/admin/users/{userId}/children",
  tags: ["Admin"],
  security: bearerSecurity,
  summary: "Create child for user",
  request: {
    params: userParamsSchema,
    body: {
      content: {
        "application/json": {
          schema: AdminCreateChildForUserInputSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    201: jsonDataResponse(AdminChildDetailSchema, "Created child."),
    ...errorResponses([400, 401, 403, 404, 409]),
  },
});

const banUserRoute = createRoute({
  method: "post",
  path: "/admin/users/{userId}/ban",
  tags: ["Admin"],
  security: bearerSecurity,
  summary: "Ban user",
  request: {
    params: userParamsSchema,
    body: {
      content: {
        "application/json": {
          schema: AdminBanUserInputSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    200: jsonDataResponse(UserProfileSchema, "Banned user."),
    ...errorResponses([400, 401, 403, 404]),
  },
});

const unbanUserRoute = createRoute({
  method: "post",
  path: "/admin/users/{userId}/unban",
  tags: ["Admin"],
  security: bearerSecurity,
  summary: "Unban user",
  request: {
    params: userParamsSchema,
    body: {
      content: {
        "application/json": {
          schema: AdminUnbanUserInputSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    200: jsonDataResponse(UserProfileSchema, "Unbanned user."),
    ...errorResponses([400, 401, 403, 404]),
  },
});

const listFamiliesRoute = createRoute({
  method: "get",
  path: "/admin/families",
  tags: ["Admin"],
  security: bearerSecurity,
  summary: "List families",
  request: {
    query: listFamiliesQuerySchema,
  },
  responses: {
    200: jsonDataResponse(PaginatedAdminFamiliesSchema, "Paginated families."),
    ...errorResponses([401, 403]),
  },
});

const getFamilyRoute = createRoute({
  method: "get",
  path: "/admin/families/{familyId}",
  tags: ["Admin"],
  security: bearerSecurity,
  summary: "Get family",
  request: { params: familyParamsSchema },
  responses: {
    200: jsonDataResponse(AdminFamilyDetailSchema.nullable(), "Single family."),
    ...errorResponses([400, 401, 403]),
  },
});

const createFamilyRoute = createRoute({
  method: "post",
  path: "/admin/families",
  tags: ["Admin"],
  security: bearerSecurity,
  summary: "Create family",
  request: {
    body: {
      content: {
        "application/json": {
          schema: AdminCreateFamilyInputSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    201: jsonDataResponse(AdminFamilyDetailSchema, "Created family."),
    ...errorResponses([400, 401, 403, 404, 409]),
  },
});

const addFamilyMemberRoute = createRoute({
  method: "post",
  path: "/admin/families/{familyId}/members",
  tags: ["Admin"],
  security: bearerSecurity,
  summary: "Add existing user to family",
  request: {
    params: familyParamsSchema,
    body: {
      content: {
        "application/json": {
          schema: AdminAddFamilyMemberInputSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    200: jsonDataResponse(AdminFamilyDetailSchema, "Updated family."),
    ...errorResponses([400, 401, 403, 404, 409]),
  },
});

const transferFamilyAdminRoute = createRoute({
  method: "post",
  path: "/admin/families/{familyId}/admin",
  tags: ["Admin"],
  security: bearerSecurity,
  summary: "Transfer family admin",
  request: {
    params: familyParamsSchema,
    body: {
      content: {
        "application/json": {
          schema: AdminTransferFamilyAdminInputSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    200: jsonDataResponse(AdminFamilyDetailSchema, "Updated family."),
    ...errorResponses([400, 401, 403, 404, 409]),
  },
});

const createFamilyJoinCodeAdminRoute = createRoute({
  method: "post",
  path: "/admin/families/{familyId}/join-codes",
  tags: ["Admin"],
  security: bearerSecurity,
  summary: "Create family join code",
  request: {
    params: familyParamsSchema,
    body: {
      content: {
        "application/json": {
          schema: z.object({
            phoneNumber: z.string().trim().min(1),
            expiresAt: z.string().datetime().nullable().optional(),
          }),
        },
      },
      required: true,
    },
  },
  responses: {
    200: jsonDataResponse(AdminFamilyDetailSchema, "Updated family."),
    ...errorResponses([400, 401, 403, 404, 409]),
  },
});

const revokeFamilyJoinCodeAdminRoute = createRoute({
  method: "post",
  path: "/admin/families/{familyId}/join-codes/{joinCodeId}/revoke",
  tags: ["Admin"],
  security: bearerSecurity,
  summary: "Revoke family join code",
  request: {
    params: joinCodeParamsSchema,
  },
  responses: {
    200: jsonDataResponse(AdminFamilyDetailSchema, "Updated family."),
    ...errorResponses([400, 401, 403, 404, 409]),
  },
});

const listChildrenRoute = createRoute({
  method: "get",
  path: "/admin/children",
  tags: ["Admin"],
  security: bearerSecurity,
  summary: "List children",
  request: {
    query: listChildrenQuerySchema,
  },
  responses: {
    200: jsonDataResponse(PaginatedAdminChildrenSchema, "Paginated children."),
    ...errorResponses([401, 403]),
  },
});

const getChildRoute = createRoute({
  method: "get",
  path: "/admin/children/{childId}",
  tags: ["Admin"],
  security: bearerSecurity,
  summary: "Get child",
  request: { params: childParamsSchema },
  responses: {
    200: jsonDataResponse(AdminChildDetailSchema.nullable(), "Single child."),
    ...errorResponses([400, 401, 403]),
  },
});

const updateChildRoute = createRoute({
  method: "patch",
  path: "/admin/children/{childId}",
  tags: ["Admin"],
  security: bearerSecurity,
  summary: "Update child",
  request: {
    params: childParamsSchema,
    body: {
      content: {
        "application/json": {
          schema: AdminUpdateChildInputSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    200: jsonDataResponse(AdminChildDetailSchema, "Updated child."),
    ...errorResponses([400, 401, 403, 404]),
  },
});

const getChildActivityRoute = createRoute({
  method: "get",
  path: "/admin/children/{childId}/activity",
  tags: ["Admin"],
  security: bearerSecurity,
  summary: "Get child activity",
  request: {
    params: childParamsSchema,
    query: activityQuerySchema,
  },
  responses: {
    200: jsonDataResponse(ChildActivityResponseSchema, "Child activity."),
    ...errorResponses([400, 401, 403, 404]),
  },
});

const getChildLocationEventsRoute = createRoute({
  method: "get",
  path: "/admin/children/{childId}/location-events",
  tags: ["Admin"],
  security: bearerSecurity,
  summary: "Get child location events",
  request: {
    params: childParamsSchema,
    query: locationEventsQuerySchema,
  },
  responses: {
    200: jsonDataResponse(AdminLocationEventListResponseSchema, "Child location events."),
    ...errorResponses([400, 401, 403, 404]),
  },
});

const getChildTrailRoute = createRoute({
  method: "get",
  path: "/admin/children/{childId}/trail",
  tags: ["Admin"],
  security: bearerSecurity,
  summary: "Get child trail",
  request: {
    params: childParamsSchema,
    query: trailQuerySchema,
  },
  responses: {
    200: jsonDataResponse(ChildTrailResponseSchema, "Child trail."),
    ...errorResponses([400, 401, 403, 404]),
  },
});

const listDevicesRoute = createRoute({
  method: "get",
  path: "/admin/devices",
  tags: ["Admin"],
  security: bearerSecurity,
  summary: "List devices",
  request: {
    query: listDevicesQuerySchema,
  },
  responses: {
    200: jsonDataResponse(PaginatedAdminDevicesSchema, "Paginated devices."),
    ...errorResponses([401, 403]),
  },
});

const getDeviceRoute = createRoute({
  method: "get",
  path: "/admin/devices/{deviceId}",
  tags: ["Admin"],
  security: bearerSecurity,
  summary: "Get device",
  request: { params: deviceParamsSchema },
  responses: {
    200: jsonDataResponse(AdminDeviceDetailSchema.nullable(), "Single device."),
    ...errorResponses([400, 401, 403]),
  },
});

const getDeviceLiveTelemetryRoute = createRoute({
  method: "get",
  path: "/admin/devices/{deviceId}/live",
  tags: ["Admin"],
  security: bearerSecurity,
  summary: "Get device live telemetry",
  request: { params: deviceParamsSchema },
  responses: {
    200: jsonDataResponse(AdminDeviceLiveTelemetrySchema, "Device live telemetry."),
    ...errorResponses([400, 401, 403, 404]),
  },
});

const getDeviceLocationEventsRoute = createRoute({
  method: "get",
  path: "/admin/devices/{deviceId}/location-events",
  tags: ["Admin"],
  security: bearerSecurity,
  summary: "Get device location events",
  request: {
    params: deviceParamsSchema,
    query: locationEventsQuerySchema,
  },
  responses: {
    200: jsonDataResponse(AdminLocationEventListResponseSchema, "Device location events."),
    ...errorResponses([400, 401, 403, 404]),
  },
});

const createDeviceRoute = createRoute({
  method: "post",
  path: "/admin/devices",
  tags: ["Admin"],
  security: bearerSecurity,
  summary: "Create device",
  request: {
    body: {
      content: {
        "application/json": {
          schema: createDeviceSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    201: jsonDataResponse(AdminDeviceSchema, "Created device."),
    ...errorResponses([400, 401, 403, 409]),
  },
});

const bulkCreateDevicesRoute = createRoute({
  method: "post",
  path: "/admin/devices/bulk",
  tags: ["Admin"],
  security: bearerSecurity,
  summary: "Bulk create devices",
  request: {
    body: {
      content: {
        "application/json": {
          schema: AdminBulkCreateDeviceInputSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    200: jsonDataResponse(AdminBulkCreateDeviceResultSchema, "Bulk device create result."),
    ...errorResponses([400, 401, 403]),
  },
});

const updateDeviceRoute = createRoute({
  method: "patch",
  path: "/admin/devices/{deviceId}",
  tags: ["Admin"],
  security: bearerSecurity,
  summary: "Update device",
  request: {
    params: deviceParamsSchema,
    body: {
      content: {
        "application/json": {
          schema: deviceSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    200: jsonDataResponse(AdminDeviceSchema, "Updated device."),
    ...errorResponses([400, 401, 403, 404]),
  },
});

const bindDeviceRoute = createRoute({
  method: "post",
  path: "/admin/devices/{deviceId}/bind",
  tags: ["Admin"],
  security: bearerSecurity,
  summary: "Bind device",
  request: {
    params: deviceParamsSchema,
    body: {
      content: {
        "application/json": {
          schema: bindDeviceSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    200: jsonDataResponse(DeviceBindResultSchema, "Bound device."),
    ...errorResponses([400, 401, 403, 404]),
  },
});

const unbindDeviceRoute = createRoute({
  method: "post",
  path: "/admin/devices/{deviceId}/unbind",
  tags: ["Admin"],
  security: bearerSecurity,
  summary: "Unbind device",
  request: { params: deviceParamsSchema },
  responses: {
    200: jsonDataResponse(DeviceUnbindResultSchema, "Unbound device."),
    ...errorResponses([400, 401, 403, 404]),
  },
});

const listGeofencesRoute = createRoute({
  method: "get",
  path: "/admin/geofences",
  tags: ["Admin"],
  security: bearerSecurity,
  summary: "List geofences",
  request: {
    query: listGeofencesQuerySchema,
  },
  responses: {
    200: jsonDataResponse(PaginatedAdminGeofencesSchema, "Paginated geofences."),
    ...errorResponses([400, 401, 403]),
  },
});

const getGeofenceRoute = createRoute({
  method: "get",
  path: "/admin/geofences/{geofenceId}",
  tags: ["Admin"],
  security: bearerSecurity,
  summary: "Get geofence",
  request: {
    params: z.object({ geofenceId: pathUuidParam("geofenceId") }),
  },
  responses: {
    200: jsonDataResponse(AdminGeofenceSchema.nullable(), "Single geofence."),
    ...errorResponses([400, 401, 403]),
  },
});

const listGeofenceEventsRoute = createRoute({
  method: "get",
  path: "/admin/geofences/{geofenceId}/events",
  tags: ["Admin"],
  security: bearerSecurity,
  summary: "List geofence events",
  request: {
    params: z.object({ geofenceId: pathUuidParam("geofenceId") }),
    query: geofenceEventsQuerySchema,
  },
  responses: {
    200: jsonDataResponse(PaginatedAdminGeofenceEventsSchema, "Geofence events."),
    ...errorResponses([400, 401, 403]),
  },
});

const listGeofenceBreachesRoute = createRoute({
  method: "get",
  path: "/admin/geofence-breaches",
  tags: ["Admin"],
  security: bearerSecurity,
  summary: "List geofence breaches",
  request: {
    query: listGeofenceBreachesQuerySchema,
  },
  responses: {
    200: jsonDataResponse(PaginatedAdminGeofenceEventsSchema, "Geofence breaches."),
    ...errorResponses([400, 401, 403]),
  },
});

const getGeofenceBreachCountsRoute = createRoute({
  method: "get",
  path: "/admin/geofence-breaches/counts",
  tags: ["Admin"],
  security: bearerSecurity,
  summary: "Get geofence breach counts",
  responses: {
    200: jsonDataResponse(AdminGeofenceBreachCountsSchema, "Geofence breach counts."),
    ...errorResponses([400, 401, 403]),
  },
});

const acknowledgeGeofenceBreachRoute = createRoute({
  method: "post",
  path: "/admin/geofence-breaches/{geofenceEventId}/ack",
  tags: ["Admin"],
  security: bearerSecurity,
  summary: "Acknowledge geofence breach",
  request: {
    params: z.object({ geofenceEventId: pathUuidParam("geofenceEventId") }),
    body: {
      content: {
        "application/json": {
          schema: AdminAcknowledgeGeofenceBreachInputSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    200: jsonDataResponse(AdminGeofenceEventSchema.nullable(), "Acknowledged breach."),
    ...errorResponses([400, 401, 403]),
  },
});

const acknowledgeGeofenceBreachesRoute = createRoute({
  method: "post",
  path: "/admin/geofence-breaches/ack",
  tags: ["Admin"],
  security: bearerSecurity,
  summary: "Bulk acknowledge geofence breaches",
  request: {
    body: {
      content: {
        "application/json": {
          schema: AdminBulkAcknowledgeGeofenceBreachesInputSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    200: jsonDataResponse(AdminGeofenceBreachCountsSchema, "Updated geofence breach counts."),
    ...errorResponses([400, 401, 403]),
  },
});

const listPlansRoute = createRoute({
  method: "get",
  path: "/admin/plans",
  tags: ["Admin"],
  security: bearerSecurity,
  summary: "List plans",
  responses: {
    200: jsonDataResponse(z.array(AdminPlanRecordSchema), "All plans."),
    ...errorResponses([401, 403]),
  },
});

const createPlanRoute = createRoute({
  method: "post",
  path: "/admin/plans",
  tags: ["Admin"],
  security: bearerSecurity,
  summary: "Create plan",
  request: {
    body: {
      content: {
        "application/json": {
          schema: planSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    201: jsonDataResponse(AdminPlanRecordSchema, "Created plan."),
    ...errorResponses([400, 401, 403]),
  },
});

const updatePlanRoute = createRoute({
  method: "patch",
  path: "/admin/plans/{planId}",
  tags: ["Admin"],
  security: bearerSecurity,
  summary: "Update plan",
  request: {
    params: planParamsSchema,
    body: {
      content: {
        "application/json": {
          schema: planSchema.partial(),
        },
      },
      required: true,
    },
  },
  responses: {
    200: jsonDataResponse(AdminPlanRecordSchema.nullable(), "Updated plan."),
    ...errorResponses([400, 401, 403]),
  },
});

const createSubscriptionRoute = createRoute({
  method: "post",
  path: "/admin/children/{childId}/subscriptions",
  tags: ["Admin"],
  security: bearerSecurity,
  summary: "Create subscription",
  request: {
    params: childParamsSchema,
    body: {
      content: {
        "application/json": {
          schema: subscriptionSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    201: jsonDataResponse(AdminSubscriptionRecordSchema, "Created subscription."),
    ...errorResponses([400, 401, 403]),
  },
});

const updateSubscriptionRoute = createRoute({
  method: "patch",
  path: "/admin/subscriptions/{subscriptionId}",
  tags: ["Admin"],
  security: bearerSecurity,
  summary: "Update subscription",
  request: {
    params: subscriptionParamsSchema,
    body: {
      content: {
        "application/json": {
          schema: subscriptionSchema.partial(),
        },
      },
      required: true,
    },
  },
  responses: {
    200: jsonDataResponse(AdminSubscriptionRecordSchema.nullable(), "Updated subscription."),
    ...errorResponses([400, 401, 403]),
  },
});

const deleteSubscriptionRoute = createRoute({
  method: "delete",
  path: "/admin/subscriptions/{subscriptionId}",
  tags: ["Admin"],
  security: bearerSecurity,
  summary: "Cancel subscription",
  request: {
    params: subscriptionParamsSchema,
  },
  responses: {
    200: jsonDataResponse(AdminSubscriptionRecordSchema.nullable(), "Cancelled subscription."),
    ...errorResponses([400, 401, 403]),
  },
});

const listCmsPagesRoute = createRoute({
  method: "get",
  path: "/admin/cms-pages",
  tags: ["Admin"],
  security: bearerSecurity,
  summary: "List CMS pages",
  responses: {
    200: jsonDataResponse(z.array(CmsPageSchema), "All CMS pages."),
    ...errorResponses([401, 403]),
  },
});

const createCmsPageRoute = createRoute({
  method: "post",
  path: "/admin/cms-pages",
  tags: ["Admin"],
  security: bearerSecurity,
  summary: "Create CMS page",
  request: {
    body: {
      content: {
        "application/json": {
          schema: cmsSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    201: jsonDataResponse(CmsPageSchema, "Created CMS page."),
    ...errorResponses([400, 401, 403]),
  },
});

const updateCmsPageRoute = createRoute({
  method: "patch",
  path: "/admin/cms-pages/{pageId}",
  tags: ["Admin"],
  security: bearerSecurity,
  summary: "Update CMS page",
  request: {
    params: cmsPageParamsSchema,
    body: {
      content: {
        "application/json": {
          schema: cmsSchema.partial(),
        },
      },
      required: true,
    },
  },
  responses: {
    200: jsonDataResponse(CmsPageSchema.nullable(), "Updated CMS page."),
    ...errorResponses([400, 401, 403]),
  },
});

const listNotificationsRoute = createRoute({
  method: "get",
  path: "/admin/notifications",
  tags: ["Admin"],
  security: bearerSecurity,
  summary: "List notifications",
  responses: {
    200: jsonDataResponse(z.array(NotificationSchema), "All notifications."),
    ...errorResponses([401, 403]),
  },
});

const createNotificationRoute = createRoute({
  method: "post",
  path: "/admin/notifications",
  tags: ["Admin"],
  security: bearerSecurity,
  summary: "Create notification",
  request: {
    body: {
      content: {
        "application/json": {
          schema: notificationSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    201: jsonDataResponse(NotificationSchema, "Created notification."),
    ...errorResponses([400, 401, 403]),
  },
});

const updateNotificationRoute = createRoute({
  method: "patch",
  path: "/admin/notifications/{notificationId}",
  tags: ["Admin"],
  security: bearerSecurity,
  summary: "Update notification",
  request: {
    params: notificationParamsSchema,
    body: {
      content: {
        "application/json": {
          schema: notificationSchema.partial(),
        },
      },
      required: true,
    },
  },
  responses: {
    200: jsonDataResponse(NotificationSchema.nullable(), "Updated notification."),
    ...errorResponses([400, 401, 403]),
  },
});

const adminRoutes = createOpenApiApp();

adminRoutes.openapi(listUsersRoute, async (c) => {
  const query = c.req.valid("query");
  return ok(c, await listAdminUsers(query));
});

adminRoutes.openapi(getUserRoute, async (c) => {
  const { userId } = c.req.valid("param");
  try {
    return ok(c, await getAdminUserById(userId));
  } catch (error) {
    if (isAppError(error) && error.status === 404) {
      return ok(c, null);
    }

    throw error;
  }
});

adminRoutes.openapi(updateUserRoute, async (c) => {
  const { userId } = c.req.valid("param");
  const body = c.req.valid("json");
  return ok(c, await updateAdminUser(userId, body));
});

adminRoutes.openapi(createUserChildRoute, async (c) => {
  const { userId } = c.req.valid("param");
  const body = c.req.valid("json");
  const child = await createAdminChildForUser(userId, body);
  adminRealtimeRegistry.broadcast({
    type: "admin:child.updated",
    data: {
      childId: child.id,
      deviceId: body.deviceId,
      reason: "child_created",
    },
  });
  adminRealtimeRegistry.broadcast({
    type: "admin:family.changed",
    data: {
      familyId: child.organizationId,
      reason: "child_created",
    },
  });
  return created(c, child);
});

adminRoutes.openapi(banUserRoute, async (c) => {
  const { userId } = c.req.valid("param");
  const body = c.req.valid("json");
  return ok(c, await banAdminUser(userId, body));
});

adminRoutes.openapi(unbanUserRoute, async (c) => {
  const { userId } = c.req.valid("param");
  c.req.valid("json");
  return ok(c, await unbanAdminUser(userId));
});

adminRoutes.openapi(listFamiliesRoute, async (c) => {
  const query = c.req.valid("query");
  return ok(c, await listAdminFamilies(query));
});

adminRoutes.openapi(getFamilyRoute, async (c) => {
  const { familyId } = c.req.valid("param");
  return ok(c, await getAdminFamilyById(familyId));
});

adminRoutes.openapi(createFamilyRoute, async (c) => {
  const body = c.req.valid("json");
  const family = await createAdminFamily(body);
  adminRealtimeRegistry.broadcast({
    type: "admin:family.changed",
    data: {
      familyId: family.id,
      reason: "family_created",
    },
  });
  return created(c, family);
});

adminRoutes.openapi(addFamilyMemberRoute, async (c) => {
  const { familyId } = c.req.valid("param");
  const body = c.req.valid("json");
  const family = await addAdminFamilyMember(familyId, body);
  adminRealtimeRegistry.broadcast({
    type: "admin:family.changed",
    data: {
      familyId,
      reason: "family_member_added",
    },
  });
  return ok(c, family);
});

adminRoutes.openapi(transferFamilyAdminRoute, async (c) => {
  const { familyId } = c.req.valid("param");
  const body = c.req.valid("json");
  const family = await transferAdminFamilyAdmin(familyId, body);
  adminRealtimeRegistry.broadcast({
    type: "admin:family.changed",
    data: {
      familyId,
      reason: "family_admin_transferred",
    },
  });
  return ok(c, family);
});

adminRoutes.openapi(createFamilyJoinCodeAdminRoute, async (c) => {
  const { familyId } = c.req.valid("param");
  const body = c.req.valid("json");
  const user = c.get("user");
  await createFamilyJoinCode({
    organizationId: familyId,
    createdByUserId: user.id,
    phoneNumber: body.phoneNumber,
    expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
  });
  adminRealtimeRegistry.broadcast({
    type: "admin:family.changed",
    data: {
      familyId,
      reason: "family_join_code_created",
    },
  });
  return ok(c, await getAdminFamilyById(familyId));
});

adminRoutes.openapi(revokeFamilyJoinCodeAdminRoute, async (c) => {
  const { familyId, joinCodeId } = c.req.valid("param");
  await revokeFamilyJoinCode(familyId, joinCodeId);
  adminRealtimeRegistry.broadcast({
    type: "admin:family.changed",
    data: {
      familyId,
      reason: "family_join_code_revoked",
    },
  });
  return ok(c, await getAdminFamilyById(familyId));
});

adminRoutes.openapi(listChildrenRoute, async (c) => {
  const query = c.req.valid("query");
  return ok(c, await listAdminChildren(query));
});

adminRoutes.openapi(getChildRoute, async (c) => {
  const { childId } = c.req.valid("param");
  return ok(c, await getAdminChildById(childId));
});

adminRoutes.openapi(updateChildRoute, async (c) => {
  const { childId } = c.req.valid("param");
  const body = c.req.valid("json");
  return ok(c, await updateAdminChild(childId, body));
});

adminRoutes.openapi(getChildActivityRoute, async (c) => {
  const { childId } = c.req.valid("param");
  const query = c.req.valid("query");
  return ok(c, await getAdminChildActivity(childId, query));
});

adminRoutes.openapi(getChildLocationEventsRoute, async (c) => {
  const { childId } = c.req.valid("param");
  const query = c.req.valid("query");
  return ok(c, await listAdminChildLocationEvents(childId, query));
});

adminRoutes.openapi(getChildTrailRoute, async (c) => {
  const { childId } = c.req.valid("param");
  const query = c.req.valid("query");
  return ok(c, await getAdminChildTrail(childId, query.distanceMeters, query.geometry));
});

adminRoutes.openapi(listDevicesRoute, async (c) => {
  const query = c.req.valid("query");
  return ok(c, await listAdminDevices(query));
});

adminRoutes.openapi(getDeviceRoute, async (c) => {
  const { deviceId } = c.req.valid("param");
  return ok(c, await getAdminDeviceById(deviceId));
});

adminRoutes.openapi(getDeviceLiveTelemetryRoute, async (c) => {
  const { deviceId } = c.req.valid("param");
  return ok(c, await getAdminDeviceLiveTelemetry(deviceId));
});

adminRoutes.openapi(getDeviceLocationEventsRoute, async (c) => {
  const { deviceId } = c.req.valid("param");
  const query = c.req.valid("query");
  return ok(c, await listAdminDeviceLocationEvents(deviceId, query));
});

adminRoutes.openapi(createDeviceRoute, async (c) => {
  const body = c.req.valid("json");
  return created(c, await createDevice(body));
});

adminRoutes.openapi(bulkCreateDevicesRoute, async (c) => {
  const body = c.req.valid("json");
  return ok(c, await bulkCreateDevices(body));
});

adminRoutes.openapi(updateDeviceRoute, async (c) => {
  const { deviceId } = c.req.valid("param");
  const body = c.req.valid("json");
  return ok(c, await updateDevice(deviceId, body));
});

adminRoutes.openapi(bindDeviceRoute, async (c) => {
  const { deviceId } = c.req.valid("param");
  const body = c.req.valid("json");
  const result = await bindDevice(deviceId, body.childId);
  adminRealtimeRegistry.broadcast({
    type: "admin:child.updated",
    data: {
      childId: body.childId,
      deviceId,
      reason: "device_bound",
    },
  });
  adminRealtimeRegistry.broadcast({
    type: "admin:device.telemetry.changed",
    data: {
      deviceId,
      childId: body.childId,
      reason: "device_bound",
    },
  });
  return ok(c, result);
});

adminRoutes.openapi(unbindDeviceRoute, async (c) => {
  const { deviceId } = c.req.valid("param");
  const result = await unbindDevice(deviceId);
  adminRealtimeRegistry.broadcast({
    type: "admin:child.updated",
    data: {
      childId: result.childId,
      deviceId,
      reason: "device_unbound",
    },
  });
  adminRealtimeRegistry.broadcast({
    type: "admin:device.telemetry.changed",
    data: {
      deviceId,
      childId: result.childId,
      reason: "device_unbound",
    },
  });
  return ok(c, result);
});

adminRoutes.openapi(listGeofencesRoute, async (c) => {
  const query = c.req.valid("query");
  return ok(c, await listAdminGeofences(query));
});

adminRoutes.openapi(getGeofenceRoute, async (c) => {
  const { geofenceId } = c.req.valid("param");
  return ok(c, await getAdminGeofenceById(geofenceId));
});

adminRoutes.openapi(listGeofenceEventsRoute, async (c) => {
  const { geofenceId } = c.req.valid("param");
  const query = c.req.valid("query");
  return ok(c, await listAdminGeofenceEvents(geofenceId, query));
});

adminRoutes.openapi(listGeofenceBreachesRoute, async (c) => {
  const query = c.req.valid("query");
  return ok(c, await listAdminGeofenceBreaches(query));
});

adminRoutes.openapi(getGeofenceBreachCountsRoute, async (c) => {
  return ok(c, await getAdminGeofenceBreachCounts());
});

adminRoutes.openapi(acknowledgeGeofenceBreachRoute, async (c) => {
  const { geofenceEventId } = c.req.valid("param");
  const body = c.req.valid("json");
  const user = c.get("user");
  await acknowledgeAdminGeofenceBreach(geofenceEventId, user.id, body);
  const events = await listAdminGeofenceBreaches({
    acknowledged: "true",
    page: 1,
    pageSize: 100,
  });
  const event = events.items.find((item) => item.id === geofenceEventId) ?? null;
  adminRealtimeRegistry.broadcast({
    type: "admin:geofence.breach.acknowledged",
    data: {
      geofenceId: event?.geofenceId,
      geofenceEventId,
      childId: event?.child.id,
      deviceId: event?.device?.id,
      reason: "breach_acknowledged",
    },
  });
  return ok(c, event);
});

adminRoutes.openapi(acknowledgeGeofenceBreachesRoute, async (c) => {
  const body = c.req.valid("json");
  const user = c.get("user");
  await acknowledgeAdminGeofenceBreaches(user.id, body);
  for (const eventId of body.eventIds) {
    adminRealtimeRegistry.broadcast({
      type: "admin:geofence.breach.acknowledged",
      data: {
        geofenceEventId: eventId,
        reason: "breach_acknowledged",
      },
    });
  }
  return ok(c, await getAdminGeofenceBreachCounts());
});

adminRoutes.openapi(listPlansRoute, async (c) => {
  const rows = await db.select().from(plans).orderBy(plans.durationMonths);
  return ok(c, rows);
});

adminRoutes.openapi(createPlanRoute, async (c) => {
  const body = c.req.valid("json");
  const [plan] = await db.insert(plans).values({
    ...body,
    description: body.description ?? null,
    amountMinor: body.amountMinor ?? null,
    currencyCode: body.currencyCode ?? null,
    status: body.status ?? "active",
  }).returning();
  return created(c, plan);
});

adminRoutes.openapi(updatePlanRoute, async (c) => {
  const { planId } = c.req.valid("param");
  const body = c.req.valid("json");
  const [plan] = await db.update(plans).set({
    ...body,
    updatedAt: new Date(),
  }).where(eq(plans.id, planId)).returning();
  return ok(c, plan ?? null);
});

adminRoutes.openapi(createSubscriptionRoute, async (c) => {
  const { childId } = c.req.valid("param");
  const body = c.req.valid("json");

  const [subscription] = await db.transaction(async (tx) => {
    if ((body.status ?? "active") === "active") {
      await tx.update(childPlanSubscriptions).set({
        status: "cancelled",
        updatedAt: new Date(),
      }).where(and(eq(childPlanSubscriptions.childId, childId), eq(childPlanSubscriptions.status, "active")));
    }

    return tx.insert(childPlanSubscriptions).values({
      childId,
      planId: body.planId,
      source: body.source ?? "admin",
      externalOrderId: body.externalOrderId ?? null,
      externalPurchaseId: body.externalPurchaseId ?? null,
      status: body.status ?? "active",
      startsAt: new Date(body.startsAt),
      endsAt: new Date(body.endsAt),
    }).returning();
  });

  return created(c, subscription);
});

adminRoutes.openapi(updateSubscriptionRoute, async (c) => {
  const { subscriptionId } = c.req.valid("param");
  const body = c.req.valid("json");
  const [subscription] = await db.update(childPlanSubscriptions).set({
    planId: body.planId,
    source: body.source,
    externalOrderId: body.externalOrderId,
    externalPurchaseId: body.externalPurchaseId,
    status: body.status,
    startsAt: body.startsAt ? new Date(body.startsAt) : undefined,
    endsAt: body.endsAt ? new Date(body.endsAt) : undefined,
    updatedAt: new Date(),
  }).where(eq(childPlanSubscriptions.id, subscriptionId)).returning();
  return ok(c, subscription ?? null);
});

adminRoutes.openapi(deleteSubscriptionRoute, async (c) => {
  const { subscriptionId } = c.req.valid("param");
  const [subscription] = await db.update(childPlanSubscriptions).set({
    status: "cancelled",
    updatedAt: new Date(),
  }).where(eq(childPlanSubscriptions.id, subscriptionId)).returning();
  return ok(c, subscription ?? null);
});

adminRoutes.openapi(listCmsPagesRoute, async (c) => {
  const rows = await db.select().from(cmsPages).orderBy(cmsPages.slug);
  return ok(c, rows);
});

adminRoutes.openapi(createCmsPageRoute, async (c) => {
  const body = c.req.valid("json");
  const [page] = await db.insert(cmsPages).values({
    ...body,
    status: body.status ?? "draft",
  }).returning();
  return created(c, page);
});

adminRoutes.openapi(updateCmsPageRoute, async (c) => {
  const { pageId } = c.req.valid("param");
  const body = c.req.valid("json");
  const [page] = await db.update(cmsPages).set({
    ...body,
    updatedAt: new Date(),
  }).where(eq(cmsPages.id, pageId)).returning();
  return ok(c, page ?? null);
});

adminRoutes.openapi(listNotificationsRoute, async (c) => {
  const rows = await db.select().from(notifications).orderBy(desc(notifications.createdAt));
  return ok(c, rows);
});

adminRoutes.openapi(createNotificationRoute, async (c) => {
  const body = c.req.valid("json");
  const [notification] = await db.insert(notifications).values({
    title: body.title,
    body: body.body,
    imageUrl: body.imageUrl ?? null,
    targetRole: body.targetRole ?? null,
    targetUserId: body.targetUserId ?? null,
    status: body.status ?? "draft",
    publishedAt: body.publishedAt ? new Date(body.publishedAt) : null,
  }).returning();
  return created(c, notification);
});

adminRoutes.openapi(updateNotificationRoute, async (c) => {
  const { notificationId } = c.req.valid("param");
  const body = c.req.valid("json");
  const [notification] = await db.update(notifications).set({
    title: body.title,
    body: body.body,
    imageUrl: body.imageUrl,
    targetRole: body.targetRole,
    targetUserId: body.targetUserId,
    status: body.status,
    publishedAt: body.publishedAt ? new Date(body.publishedAt) : undefined,
    updatedAt: new Date(),
  }).where(eq(notifications.id, notificationId)).returning();
  return ok(c, notification ?? null);
});

export { adminRoutes };
