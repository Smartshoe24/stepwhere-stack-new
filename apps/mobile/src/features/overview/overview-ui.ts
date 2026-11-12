import type {
  ChildTrackingStatus,
  LocationSource,
  OverviewChildDto,
} from "@stepwhere/types";

import { getEffectiveTelemetryState } from "./telemetry-presentation";

export type AvatarTone = "mint" | "amber" | "blue" | "rose";

export type OverviewChildCard = OverviewChildDto & {
  avatarTone: AvatarTone;
  batteryText: string;
  hasLocationFix: boolean;
  latitude: number;
  locationSource: LocationSource | null;
  longitude: number;
  locationLabel: string;
  statusLabel: string;
};

const AVATAR_TONES: AvatarTone[] = ["mint", "amber", "blue", "rose"];

const FALLBACK_STATUS_LABELS: Record<ChildTrackingStatus, string> = {
  safe: "Safe",
  transit: "On the way",
  alert: "Attention",
  offline: "Offline",
};

export const DEFAULT_CHILD_COORDINATES = {
  latitude: 22.5937,
  longitude: 78.9629,
};

export function getAvatarTone(seed: string): AvatarTone {
  const total = Array.from(seed).reduce(
    (sum, character) => sum + character.charCodeAt(0),
    0,
  );
  return AVATAR_TONES[total % AVATAR_TONES.length] ?? "mint";
}

export function toOverviewChildCard(
  child: OverviewChildDto,
  nowMs = Date.now(),
): OverviewChildCard {
  const telemetryState = getEffectiveTelemetryState(child, nowMs);
  const resolvedLatitude = child.resolvedPosition?.latitude ?? child.latitude;
  const resolvedLongitude = child.resolvedPosition?.longitude ?? child.longitude;
  const hasLocationFix = resolvedLatitude != null && resolvedLongitude != null;
  const baseLocationLabel = child.locationLabel ?? "Location unavailable";

  return {
    ...child,
    avatarTone: getAvatarTone(child.id),
    batteryText: child.batteryPercent !== null && child.batteryPercent !== undefined
      ? `${child.batteryPercent}%`
      : "No data",
    hasLocationFix,
    latitude: resolvedLatitude ?? DEFAULT_CHILD_COORDINATES.latitude,
    locationSource: child.resolvedPosition?.source ?? (hasLocationFix ? "gps" : null),
    longitude: resolvedLongitude ?? DEFAULT_CHILD_COORDINATES.longitude,
    locationLabel: hasLocationFix
      && (telemetryState === "connecting" || telemetryState === "offline")
      ? `Last known · ${baseLocationLabel}`
      : baseLocationLabel,
    statusLabel: getStatusLabel(child, telemetryState),
    telemetryState,
  };
}

function getStatusLabel(child: OverviewChildDto, telemetryState: OverviewChildCard["telemetryState"]) {
  if (telemetryState === "connecting") {
    return "Connecting";
  }

  if (telemetryState === "sleep") {
    return "Sleep";
  }

  if (telemetryState === "offline") {
    return "Offline";
  }

  return child.statusLabel ?? FALLBACK_STATUS_LABELS[child.status];
}
