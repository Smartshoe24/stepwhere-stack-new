import type { Waypoint } from "./simulator-state";

const EARTH_RADIUS_METERS = 6_371_000;

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

export function haversineDistanceMeters(from: Waypoint, to: Waypoint) {
  const dLat = toRadians(to.latitude - from.latitude);
  const dLng = toRadians(to.longitude - from.longitude);
  const lat1 = toRadians(from.latitude);
  const lat2 = toRadians(to.latitude);

  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 2 * EARTH_RADIUS_METERS * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function getRouteDistanceMeters(waypoints: Waypoint[]) {
  if (waypoints.length < 2) {
    return 0;
  }

  let total = 0;
  for (let index = 1; index < waypoints.length; index += 1) {
    total += haversineDistanceMeters(waypoints[index - 1]!, waypoints[index]!);
  }

  return total;
}

export type PreparedRoutePath = {
  points: Waypoint[];
  segmentCumulativeDistancesMeters: number[];
  totalDistanceMeters: number;
};

export function prepareRoutePath(waypoints: Waypoint[]): PreparedRoutePath {
  if (waypoints.length === 0) {
    return {
      points: [],
      segmentCumulativeDistancesMeters: [],
      totalDistanceMeters: 0,
    };
  }

  const segmentCumulativeDistancesMeters: number[] = [0];
  let totalDistanceMeters = 0;

  for (let index = 1; index < waypoints.length; index += 1) {
    totalDistanceMeters += haversineDistanceMeters(waypoints[index - 1]!, waypoints[index]!);
    segmentCumulativeDistancesMeters.push(totalDistanceMeters);
  }

  return {
    points: waypoints,
    segmentCumulativeDistancesMeters,
    totalDistanceMeters,
  };
}

export function interpolateRoutePosition(
  routePath: PreparedRoutePath,
  distanceMeters: number,
): Waypoint | null {
  if (routePath.points.length === 0) {
    return null;
  }

  if (routePath.points.length === 1 || distanceMeters <= 0) {
    return { ...routePath.points[0]! };
  }

  const clampedDistanceMeters = Math.max(0, Math.min(distanceMeters, routePath.totalDistanceMeters));
  let low = 1;
  let high = routePath.segmentCumulativeDistancesMeters.length - 1;
  let segmentIndex = routePath.segmentCumulativeDistancesMeters.length - 1;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const segmentEndDistance = routePath.segmentCumulativeDistancesMeters[middle] ?? 0;

    if (clampedDistanceMeters <= segmentEndDistance) {
      segmentIndex = middle;
      high = middle - 1;
    } else {
      low = middle + 1;
    }
  }

  const start = routePath.points[Math.max(0, segmentIndex - 1)]!;
  const end = routePath.points[segmentIndex] ?? routePath.points[routePath.points.length - 1]!;
  const segmentStartDistance = routePath.segmentCumulativeDistancesMeters[Math.max(0, segmentIndex - 1)] ?? 0;
  const segmentDistance = (routePath.segmentCumulativeDistancesMeters[segmentIndex] ?? segmentStartDistance) - segmentStartDistance;
  const ratio = segmentDistance <= 0 ? 0 : Math.min(1, (clampedDistanceMeters - segmentStartDistance) / segmentDistance);

  return {
    id: `segment-${segmentIndex}`,
    latitude: start.latitude + (end.latitude - start.latitude) * ratio,
    longitude: start.longitude + (end.longitude - start.longitude) * ratio,
  };
}

export function formatDistance(distanceMeters: number) {
  if (distanceMeters >= 1000) {
    return `${(distanceMeters / 1000).toFixed(2)} km`;
  }

  return `${Math.round(distanceMeters)} m`;
}
