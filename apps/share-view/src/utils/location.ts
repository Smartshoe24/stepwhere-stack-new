import type { PublicShareChildDto } from "@stepwhere/types";

/**
 * How the viewer should present the child's position.
 *
 * - `live`: fresh GPS fix.
 * - `approximate`: cell-network estimate. The server falls back to this during
 *   GPS outages, so it can be current even while `gpsState` is "acquiring".
 * - `last-known`: an older GPS fix while GPS is not connected.
 * - `none`: no position yet.
 */
export type LocationPresentation =
  | { kind: "none" }
  | {
      kind: "live" | "last-known";
      latitude: number;
      longitude: number;
    }
  | {
      kind: "approximate";
      latitude: number;
      longitude: number;
      /** The shoe itself has gone stale/offline, so even the estimate is old. */
      isStale: boolean;
    };

export function getLocationPresentation(child: PublicShareChildDto): LocationPresentation {
  const latitude = child.resolvedPosition?.latitude ?? child.latitude;
  const longitude = child.resolvedPosition?.longitude ?? child.longitude;

  if (latitude == null || longitude == null) {
    return { kind: "none" };
  }

  if (child.resolvedPosition?.source === "cell") {
    return {
      kind: "approximate",
      latitude,
      longitude,
      isStale: child.gpsState === "stale" || child.gpsState === "offline",
    };
  }

  return {
    kind: child.gpsState === "connected" ? "live" : "last-known",
    latitude,
    longitude,
  };
}
