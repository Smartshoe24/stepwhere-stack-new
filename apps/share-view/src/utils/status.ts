import type { PublicShareChildDto } from "@stepwhere/types";

import { getLocationPresentation } from "./location";

export function getStatusTone(telemetryState: PublicShareChildDto["telemetryState"]) {
  switch (telemetryState) {
    case "active":
      return "online";
    case "sleep":
      return "sleep";
    case "connecting":
      return "connecting";
    case "offline":
    default:
      return "offline";
  }
}

export function getStatusLabel(child: PublicShareChildDto) {
  const presentation = getLocationPresentation(child);

  if (presentation.kind === "approximate") {
    return presentation.isStale
      ? "Last known · approximate"
      : "Approximate · GPS unavailable";
  }

  if (
    child.lastUpdatedAt &&
    child.gpsState !== "connected"
  ) {
    return child.gpsState === "acquiring"
      ? "Last known · GPS acquiring"
      : `Last known · GPS ${child.gpsState}`;
  }

  return child.statusLabel;
}
