import { and, eq, gt, inArray, isNull } from "drizzle-orm";
import { type NotificationType } from "@stepwhere/types";

import {
  members,
  pushDeliveryJobs,
  pushInstallations,
  sessions,
  userNotifications,
  users,
  type children,
  type geofenceEvents,
} from "../../db/schema";
import { toInitials } from "../../shared/mappers";

type ChildRow = typeof children.$inferSelect;
type GeofenceEventRow = typeof geofenceEvents.$inferSelect;

function buildNotificationCopy(type: NotificationType, childName: string) {
  if (type === "geofence_breached") {
    return {
      title: `Safety alert: ${childName} left the safe zone`,
      body: `${childName} was detected outside the active geofence.`,
    };
  }

  return {
    title: `${childName} is back inside the safe zone`,
    body: `${childName} returned to the active geofence.`,
  };
}

export async function createGeofenceNotifications(
  tx: Parameters<Parameters<typeof import("../../db/client").db.transaction>[0]>[0],
  input: {
    child: ChildRow;
    event: GeofenceEventRow;
    type: NotificationType;
  },
) {
  const recipientRows = await tx
    .select({
      userId: users.id,
    })
    .from(members)
    .innerJoin(users, eq(users.id, members.userId))
    .where(and(
      eq(members.organizationId, input.child.organizationId),
      eq(users.status, "active"),
    ));

  if (recipientRows.length === 0) {
    return [];
  }

  const notificationCopy = buildNotificationCopy(input.type, input.child.name);
  const data = {
    route: "/home" as const,
    childId: input.child.id,
    geofenceEventId: input.event.id,
  };

  const notifications = await tx
    .insert(userNotifications)
    .values(recipientRows.map((recipient) => ({
      userId: recipient.userId,
      organizationId: input.child.organizationId,
      childId: input.child.id,
      geofenceEventId: input.event.id,
      type: input.type,
      priority: "child_safety" as const,
      title: notificationCopy.title,
      body: notificationCopy.body,
      data,
      occurredAt: input.event.occurredAt,
    })))
    .onConflictDoNothing()
    .returning();

  if (notifications.length === 0) {
    return [];
  }

  const activeInstallations = await tx
    .select({
      id: pushInstallations.id,
      userId: pushInstallations.userId,
    })
    .from(pushInstallations)
    .innerJoin(sessions, eq(sessions.id, pushInstallations.sessionId))
    .where(and(
      inArray(pushInstallations.userId, notifications.map((notification) => notification.userId)),
      eq(pushInstallations.status, "active"),
      gt(sessions.expiresAt, new Date()),
    ));

  if (activeInstallations.length === 0) {
    return notifications;
  }

  const notificationByUserId = new Map(notifications.map((notification) => [notification.userId, notification]));

  await tx
    .insert(pushDeliveryJobs)
    .values(activeInstallations.flatMap((installation) => {
      const notification = notificationByUserId.get(installation.userId);

      if (!notification) {
        return [];
      }

      return [{
        userNotificationId: notification.id,
        pushInstallationId: installation.id,
        status: "pending" as const,
      }];
    }));

  return notifications;
}

export function toNotificationChild(input: ChildRow) {
  return {
    id: input.id,
    name: input.name,
    initials: toInitials(input.name),
    avatarUrl: input.avatarUrl,
  };
}
