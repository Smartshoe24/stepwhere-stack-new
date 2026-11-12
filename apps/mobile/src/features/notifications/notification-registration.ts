import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

export type NotificationPermissionState =
  | "undetermined"
  | "provisional"
  | "denied"
  | "granted";

export const GENERAL_NOTIFICATION_CHANNEL_ID = "stepwhere-general-v1";
export const GEOFENCE_NOTIFICATION_CHANNEL_ID = "stepwhere-geofence-alerts-v2";
export const GEOFENCE_NOTIFICATION_SOUND = "alertnotification.wav";

function toPermissionState(
  permissions: Notifications.NotificationPermissionsStatus,
): NotificationPermissionState {
  if (
    Platform.OS === "ios"
    && permissions.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL
  ) {
    return "provisional";
  }

  if (
    permissions.status === "granted"
    || permissions.ios?.status === Notifications.IosAuthorizationStatus.AUTHORIZED
    || permissions.ios?.status === Notifications.IosAuthorizationStatus.EPHEMERAL
  ) {
    return "granted";
  }

  if (
    permissions.status === "denied"
    || permissions.ios?.status === Notifications.IosAuthorizationStatus.DENIED
  ) {
    return "denied";
  }

  return "undetermined";
}

export async function ensureNotificationChannels() {
  if (Platform.OS !== "android") {
    return;
  }

  await Notifications.setNotificationChannelAsync(
    GENERAL_NOTIFICATION_CHANNEL_ID,
    {
      name: "General",
      importance: Notifications.AndroidImportance.DEFAULT,
      description: "Day-to-day Stepwhere updates",
    },
  );

  await Notifications.setNotificationChannelAsync(
    GEOFENCE_NOTIFICATION_CHANNEL_ID,
    {
      name: "Geofence alerts",
      importance: Notifications.AndroidImportance.MAX,
      description: "Urgent safe zone breach and return alerts",
      enableLights: true,
      enableVibrate: true,
      vibrationPattern: [0, 250, 180, 250, 180, 250, 180, 250],
      lightColor: "#DC2626",
      sound: GEOFENCE_NOTIFICATION_SOUND,
    },
  );
}

export async function getNotificationPermissionState() {
  const permissions = await Notifications.getPermissionsAsync();
  return toPermissionState(permissions);
}

export async function requestNotificationPermission() {
  const permissions = await Notifications.requestPermissionsAsync({
    ios: {
      allowAlert: true,
      allowBadge: true,
      allowSound: true,
    },
  });
  return toPermissionState(permissions);
}

export function notificationPermissionAllowsPush(
  state: NotificationPermissionState,
) {
  return state === "granted" || state === "provisional";
}

export async function registerForExpoPushToken() {
  if (!Device.isDevice) {
    return null;
  }

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId ??
    "652fdb22-ac7e-4e6a-9b41-54662c032f6e";

  const token = await Notifications.getExpoPushTokenAsync({
    projectId,
  });

  return token.data;
}
