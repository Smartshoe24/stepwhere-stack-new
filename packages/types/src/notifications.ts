export type NotificationType = "geofence_breached" | "geofence_reentered";
export type NotificationPriority = "general" | "child_safety";

export type NotificationInboxItemDto = {
  id: string;
  type: NotificationType;
  priority: NotificationPriority;
  title: string;
  body: string;
  child: {
    id: string;
    name: string;
    initials: string;
    avatarUrl: string | null;
  } | null;
  data: {
    route: "/home";
    childId: string;
    geofenceEventId: string;
  };
  readAt: string | null;
  occurredAt: string;
  createdAt: string;
};

export type NotificationInboxResponseDto = {
  items: NotificationInboxItemDto[];
  nextCursor: string | null;
  unreadCount: number;
};

export type RegisterPushInstallationInput = {
  expoPushToken: string;
  installationId: string;
  platform: "ios" | "android";
  appVersion: string | null;
};

/** Legacy admin-broadcast notification type — kept for admin panel. */
export type NotificationDto = {
  id: string;
  title: string;
  body: string;
  imageUrl: string | null;
  targetRole: string | null;
  targetUserId: string | null;
  status: "draft" | "active" | "archived";
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};
