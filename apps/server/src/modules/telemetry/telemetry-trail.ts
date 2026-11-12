import { haversineDistanceMeters } from "../geofences/geofence-distance";

type CoordinatePoint = {
  latitude: number;
  longitude: number;
};

type RawTrailPoint = CoordinatePoint & {
  occurredAt: Date;
};

type TrailPoint = CoordinatePoint & {
  occurredAt: string;
  distanceFromLatestMeters: number;
};

function interpolatePoint(from: CoordinatePoint, to: CoordinatePoint, ratio: number): CoordinatePoint {
  return {
    latitude: from.latitude + ((to.latitude - from.latitude) * ratio),
    longitude: from.longitude + ((to.longitude - from.longitude) * ratio),
  };
}

export function buildDistanceBoundTrail(
  rowsNewestFirst: RawTrailPoint[],
  distanceMeters: number,
): TrailPoint[] {
  if (rowsNewestFirst.length === 0 || distanceMeters <= 0) {
    return [];
  }

  const trailNewestFirst: TrailPoint[] = [{
    distanceFromLatestMeters: 0,
    latitude: rowsNewestFirst[0]!.latitude,
    longitude: rowsNewestFirst[0]!.longitude,
    occurredAt: rowsNewestFirst[0]!.occurredAt.toISOString(),
  }];

  let cumulativeDistanceMeters = 0;

  for (let index = 1; index < rowsNewestFirst.length; index += 1) {
    const previousPoint = trailNewestFirst[trailNewestFirst.length - 1]!;
    const nextRawPoint = rowsNewestFirst[index]!;
    const segmentDistanceMeters = haversineDistanceMeters({
      fromLatitude: previousPoint.latitude,
      fromLongitude: previousPoint.longitude,
      toLatitude: nextRawPoint.latitude,
      toLongitude: nextRawPoint.longitude,
    });

    if (segmentDistanceMeters <= 0) {
      continue;
    }

    const nextDistanceMeters = cumulativeDistanceMeters + segmentDistanceMeters;

    if (nextDistanceMeters >= distanceMeters) {
      const remainingDistanceMeters = distanceMeters - cumulativeDistanceMeters;
      const ratio = remainingDistanceMeters / segmentDistanceMeters;
      const interpolatedPoint = interpolatePoint(previousPoint, nextRawPoint, ratio);

      trailNewestFirst.push({
        distanceFromLatestMeters: distanceMeters,
        latitude: interpolatedPoint.latitude,
        longitude: interpolatedPoint.longitude,
        occurredAt: nextRawPoint.occurredAt.toISOString(),
      });
      break;
    }

    cumulativeDistanceMeters = nextDistanceMeters;
    trailNewestFirst.push({
      distanceFromLatestMeters: cumulativeDistanceMeters,
      latitude: nextRawPoint.latitude,
      longitude: nextRawPoint.longitude,
      occurredAt: nextRawPoint.occurredAt.toISOString(),
    });
  }

  return [...trailNewestFirst].reverse();
}
