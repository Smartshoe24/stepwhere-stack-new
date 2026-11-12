import { getRouteDistanceMeters, interpolateRoutePosition, prepareRoutePath } from "./distance";
import type { PreparedRoutePath } from "./distance";
import type { Waypoint } from "./simulator-state";

export function getTravelDistanceForElapsed(input: {
  currentDistanceMeters: number;
  elapsedSeconds: number;
  speedKmh: number;
  totalDistanceMeters: number;
}) {
  const metersPerSecond = Math.max(0, input.speedKmh) * (1000 / 3600);
  return Math.min(
    input.totalDistanceMeters,
    input.currentDistanceMeters + metersPerSecond * input.elapsedSeconds,
  );
}

export function getJourneyProgress(distanceMeters: number, totalDistanceMeters: number) {
  if (totalDistanceMeters <= 0) {
    return 0;
  }

  return Math.min(100, (distanceMeters / totalDistanceMeters) * 100);
}

export function getCurrentWaypointPosition(routePath: PreparedRoutePath, distanceMeters: number) {
  return interpolateRoutePosition(routePath, distanceMeters);
}

export function getTotalRouteDistance(waypoints: Waypoint[]) {
  return getRouteDistanceMeters(waypoints);
}

export function getPreparedRoutePath(waypoints: Waypoint[]) {
  return prepareRoutePath(waypoints);
}
