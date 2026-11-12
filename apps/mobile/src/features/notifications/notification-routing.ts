import type * as Notifications from 'expo-notifications';

function extractData(value: unknown) {
  if (!value || typeof value !== 'object') {
    return null;
  }

  return value as Record<string, unknown>;
}

export function getChildIdFromNotificationData(value: unknown) {
  const data = extractData(value);
  const childId = data?.childId;

  return typeof childId === 'string' && childId.trim() ? childId : null;
}

export function getChildIdFromNotificationResponse(
  response: Notifications.NotificationResponse | null | undefined,
) {
  return getChildIdFromNotificationData(response?.notification.request.content.data);
}
