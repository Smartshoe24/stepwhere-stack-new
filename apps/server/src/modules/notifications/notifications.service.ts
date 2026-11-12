import { and, count, desc, eq, isNull, lt, or, sql } from "drizzle-orm";
import type { NotificationInboxItemDto, NotificationInboxResponseDto } from "@stepwhere/types";

import { db } from "../../db/client";
import { children, userNotifications } from "../../db/schema";
import { resolveAvatarUrl } from "../uploads/uploads.service";
import { toInitials } from "../../shared/mappers";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

function encodeCursor(occurredAt: Date, id: string) {
  return `${occurredAt.toISOString()}::${id}`;
}

function decodeCursor(cursor: string | undefined) {
  if (!cursor) {
    return null;
  }

  const [occurredAt, id] = cursor.split("::");

  if (!occurredAt || !id) {
    return null;
  }

  const parsedDate = new Date(occurredAt);

  if (Number.isNaN(parsedDate.getTime())) {
    return null;
  }

  return {
    occurredAt: parsedDate,
    id,
  };
}

async function toInboxItemDto(row: {
  notification: typeof userNotifications.$inferSelect;
  child: typeof children.$inferSelect | null;
}): Promise<NotificationInboxItemDto> {
  const rawData = row.notification.data as
    | {
      route?: "/home";
      childId?: string;
      geofenceEventId?: string;
    }
    | null;

  if (!rawData?.childId || !rawData.geofenceEventId) {
    throw new Error(`Notification ${row.notification.id} is missing required route data.`);
  }

  return {
    id: row.notification.id,
    type: row.notification.type,
    priority: row.notification.priority,
    title: row.notification.title,
    body: row.notification.body,
    child: row.child
      ? {
        id: row.child.id,
        name: row.child.name,
        initials: toInitials(row.child.name),
        avatarUrl: await resolveAvatarUrl(row.child.avatarUrl),
      }
      : null,
    data: {
      route: "/home",
      childId: rawData.childId,
      geofenceEventId: rawData.geofenceEventId,
    },
    readAt: row.notification.readAt?.toISOString() ?? null,
    occurredAt: row.notification.occurredAt.toISOString(),
    createdAt: row.notification.createdAt.toISOString(),
  };
}

export async function getUnreadNotificationCount(userId: string) {
  const [row] = await db
    .select({
      total: count(),
    })
    .from(userNotifications)
    .where(and(eq(userNotifications.userId, userId), isNull(userNotifications.readAt)));

  return row?.total ?? 0;
}

export async function getNotificationInbox(input: {
  cursor?: string;
  limit?: number;
  userId: string;
}): Promise<NotificationInboxResponseDto> {
  const limit = Math.min(Math.max(input.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
  const decodedCursor = decodeCursor(input.cursor);

  const rows = await db
    .select({
      notification: userNotifications,
      child: children,
    })
    .from(userNotifications)
    .leftJoin(children, eq(children.id, userNotifications.childId))
    .where(and(
      eq(userNotifications.userId, input.userId),
      decodedCursor
        ? or(
          lt(userNotifications.occurredAt, decodedCursor.occurredAt),
          and(
            eq(userNotifications.occurredAt, decodedCursor.occurredAt),
            lt(userNotifications.id, decodedCursor.id),
          ),
        )
        : undefined,
    ))
    .orderBy(desc(userNotifications.occurredAt), desc(userNotifications.id))
    .limit(limit + 1);

  const nextRow = rows[limit] ?? null;
  const pageRows = rows.slice(0, limit);

  return {
    items: await Promise.all(pageRows.map(toInboxItemDto)),
    nextCursor: nextRow ? encodeCursor(nextRow.notification.occurredAt, nextRow.notification.id) : null,
    unreadCount: await getUnreadNotificationCount(input.userId),
  };
}

export async function markNotificationRead(userId: string, notificationId: string) {
  const [saved] = await db
    .update(userNotifications)
    .set({
      readAt: new Date(),
    })
    .where(and(eq(userNotifications.id, notificationId), eq(userNotifications.userId, userId)))
    .returning({
      id: userNotifications.id,
    });

  return Boolean(saved);
}

export async function markAllNotificationsRead(userId: string) {
  await db
    .update(userNotifications)
    .set({
      readAt: new Date(),
    })
    .where(and(eq(userNotifications.userId, userId), isNull(userNotifications.readAt)));
}

export async function cleanupExpiredNotifications(retentionDays = 90, limit = 500) {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

  await db.execute(sql`
    with expired as (
      select ${userNotifications.id}
      from ${userNotifications}
      where ${userNotifications.occurredAt} < ${cutoff.toISOString()}::timestamptz
      order by ${userNotifications.occurredAt}, ${userNotifications.id}
      limit ${limit}
      for update skip locked
    )
    delete from ${userNotifications}
    using expired
    where ${userNotifications.id} = expired.id
  `);
}
