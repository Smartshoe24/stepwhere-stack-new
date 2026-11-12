import { createRoute, z } from "@hono/zod-openapi";

import { createOpenApiApp } from "../../openapi/create-app";
import { errorResponses, jsonDataResponse } from "../../openapi/responses";
import {
  NotificationInboxResponseSchema,
  NotificationUnreadCountSchema,
  UuidSchema,
} from "../../openapi/schemas";
import { bearerSecurity } from "../../openapi/security";
import { ok } from "../../shared/http";
import { realtimeRegistry } from "../realtime/realtime.service";
import {
  getNotificationInbox,
  getUnreadNotificationCount,
  markAllNotificationsRead,
  markNotificationRead,
} from "./notifications.service";

const notificationParamsSchema = z.object({
  notificationId: UuidSchema.openapi({
    param: {
      name: "notificationId",
      in: "path",
    },
  }),
});

const notificationQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

const listNotificationsRoute = createRoute({
  method: "get",
  path: "/notifications",
  tags: ["Notifications"],
  security: bearerSecurity,
  request: {
    query: notificationQuerySchema,
  },
  responses: {
    200: jsonDataResponse(NotificationInboxResponseSchema, "Notifications visible to the current user."),
    ...errorResponses([401]),
  },
});

const getUnreadCountRoute = createRoute({
  method: "get",
  path: "/notifications/unread-count",
  tags: ["Notifications"],
  security: bearerSecurity,
  responses: {
    200: jsonDataResponse(NotificationUnreadCountSchema, "Unread notification count."),
    ...errorResponses([401]),
  },
});

const markNotificationReadRoute = createRoute({
  method: "patch",
  path: "/notifications/{notificationId}/read",
  tags: ["Notifications"],
  security: bearerSecurity,
  request: {
    params: notificationParamsSchema,
  },
  responses: {
    200: jsonDataResponse(z.object({ read: z.boolean() }), "Marked notification as read."),
    ...errorResponses([401, 404]),
  },
});

const markAllNotificationsReadRoute = createRoute({
  method: "post",
  path: "/notifications/read-all",
  tags: ["Notifications"],
  security: bearerSecurity,
  responses: {
    200: jsonDataResponse(z.object({ read: z.boolean() }), "Marked all notifications as read."),
    ...errorResponses([401]),
  },
});

const notificationsRoutes = createOpenApiApp();

notificationsRoutes.openapi(listNotificationsRoute, async (c) => {
  const user = c.get("user");
  const { cursor, limit } = c.req.valid("query");
  return ok(c, await getNotificationInbox({
    userId: user.id,
    cursor,
    limit,
  }));
});

notificationsRoutes.openapi(getUnreadCountRoute, async (c) => {
  const user = c.get("user");
  return ok(c, {
    unreadCount: await getUnreadNotificationCount(user.id),
  });
});

notificationsRoutes.openapi(markNotificationReadRoute, async (c) => {
  const user = c.get("user");
  const organization = c.get("organization");
  const { notificationId } = c.req.valid("param");
  const updated = await markNotificationRead(user.id, notificationId);
  if (updated) {
    realtimeRegistry.broadcast(organization.id, {
      type: "notifications.changed",
      data: {
        reason: "read",
      },
    });
  }
  return ok(c, { read: updated });
});

notificationsRoutes.openapi(markAllNotificationsReadRoute, async (c) => {
  const user = c.get("user");
  const organization = c.get("organization");
  await markAllNotificationsRead(user.id);
  realtimeRegistry.broadcast(organization.id, {
    type: "notifications.changed",
    data: {
      reason: "read",
    },
  });
  return ok(c, { read: true });
});

export { notificationsRoutes };
