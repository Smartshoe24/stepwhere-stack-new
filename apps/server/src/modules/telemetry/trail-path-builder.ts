import type {
  ChildTrailGeometryRequestMode,
  ChildTrailGeometrySource,
  ChildTrailPointDto,
  ChildTrailResponseDto,
  ChildTrailSegmentDto,
} from "@stepwhere/types";

import { haversineDistanceMeters } from "../geofences/geofence-distance";
import type { RoadsSnappedPoint } from "./google-roads.client";

type TrailBuildRow = {
  id: string;
  latitude: number;
  longitude: number;
  occurredAt: Date;
  accuracyMeters: number | null;
  stepCounter: number;
};

type FilteredPoint = TrailBuildRow;

type WorkingTrailSegment = {
  source: "filtered" | "roads";
  points: FilteredPoint[];
};

type CachedTrailPoint = {
  latitude: number;
  longitude: number;
  occurredAt: string;
};

export type CachedTrailSegment = {
  source: "filtered" | "roads";
  points: CachedTrailPoint[];
};

export type TrailGeometryContext = {
  geofence?: {
    centerLatitude: number | null;
    centerLongitude: number | null;
    radiusMeters: number | null;
    status: "enabled" | "disabled" | null;
  } | null;
  geometryMode: ChildTrailGeometryRequestMode;
  roadSnapper?: (points: Array<{ latitude: number; longitude: number }>) => Promise<RoadsSnappedPoint[]>;
  roadsEnabled: boolean;
};

export type TrailGeometryBuildResult = {
  geometrySource: ChildTrailGeometrySource;
  segments: CachedTrailSegment[];
};

const DEFAULT_ACCURACY_METERS = 20;
const MAX_ACCEPTED_ACCURACY_METERS = 100;
const PATH_BREAK_DISTANCE_METERS = 300;
const PATH_BREAK_TIME_MS = 30_000;
const DEDUPE_DISTANCE_METERS = 2;
const STATIONARY_JITTER_MIN_METERS = 8;
const BOUNCE_DETOUR_MIN_METERS = 35;
const BOUNCE_RETURN_MAX_METERS = 25;
const BOUNCE_WINDOW_MS = 120_000;
const DOUGLAS_PEUCKER_TOLERANCE_METERS = 4;

function distanceMeters(from: { latitude: number; longitude: number }, to: { latitude: number; longitude: number }) {
  return haversineDistanceMeters({
    fromLatitude: from.latitude,
    fromLongitude: from.longitude,
    toLatitude: to.latitude,
    toLongitude: to.longitude,
  });
}

function interpolatePoint(from: FilteredPoint, to: FilteredPoint, ratio: number): FilteredPoint {
  return {
    ...to,
    latitude: from.latitude + ((to.latitude - from.latitude) * ratio),
    longitude: from.longitude + ((to.longitude - from.longitude) * ratio),
    occurredAt: new Date(
      from.occurredAt.getTime()
        + ((to.occurredAt.getTime() - from.occurredAt.getTime()) * ratio),
    ),
  };
}

function projectMeters(referenceLatitude: number, point: { latitude: number; longitude: number }) {
  const latitudeRadians = referenceLatitude * (Math.PI / 180);
  const metersPerLatitudeDegree = 111_320;
  const metersPerLongitudeDegree = Math.max(111_320 * Math.cos(latitudeRadians), 1);

  return {
    x: point.longitude * metersPerLongitudeDegree,
    y: point.latitude * metersPerLatitudeDegree,
  };
}

function simplifyRun(points: FilteredPoint[], toleranceMeters: number) {
  if (points.length <= 2) {
    return points;
  }

  const projected = points.map((point) => projectMeters(points[points.length - 1]!.latitude, point));
  const kept = new Set<number>([0, points.length - 1]);

  function perpendicularDistance(pointIndex: number, startIndex: number, endIndex: number) {
    const point = projected[pointIndex]!;
    const start = projected[startIndex]!;
    const end = projected[endIndex]!;
    const deltaX = end.x - start.x;
    const deltaY = end.y - start.y;

    if (deltaX === 0 && deltaY === 0) {
      return Math.hypot(point.x - start.x, point.y - start.y);
    }

    const numerator = Math.abs(
      deltaY * point.x
      - deltaX * point.y
      + end.x * start.y
      - end.y * start.x,
    );

    return numerator / Math.hypot(deltaX, deltaY);
  }

  function visit(startIndex: number, endIndex: number) {
    if (endIndex - startIndex <= 1) {
      return;
    }

    let maxDistance = 0;
    let splitIndex = -1;

    for (let index = startIndex + 1; index < endIndex; index += 1) {
      const candidateDistance = perpendicularDistance(index, startIndex, endIndex);

      if (candidateDistance > maxDistance) {
        maxDistance = candidateDistance;
        splitIndex = index;
      }
    }

    if (splitIndex >= 0 && maxDistance > toleranceMeters) {
      kept.add(splitIndex);
      visit(startIndex, splitIndex);
      visit(splitIndex, endIndex);
    }
  }

  visit(0, points.length - 1);
  return points.filter((_, index) => kept.has(index));
}

function applyKalmanFilter(points: FilteredPoint[]) {
  if (points.length <= 2) {
    return points;
  }

  let state = {
    latitude: points[0]!.latitude,
    latitudeVelocity: 0,
    longitude: points[0]!.longitude,
    longitudeVelocity: 0,
  };
  let covariance = {
    latPos: 25,
    latVel: 1,
    lonPos: 25,
    lonVel: 1,
  };

  return points.map((point, index) => {
    if (index === 0) {
      return point;
    }

    const previous = points[index - 1]!;
    const deltaSeconds = Math.max(1, (point.occurredAt.getTime() - previous.occurredAt.getTime()) / 1000);
    const processNoise = Math.max(1, deltaSeconds * 0.6);
    const measurementNoise = Math.max(4, (point.accuracyMeters ?? DEFAULT_ACCURACY_METERS) ** 2);

    state = {
      latitude: state.latitude + (state.latitudeVelocity * deltaSeconds),
      latitudeVelocity: state.latitudeVelocity,
      longitude: state.longitude + (state.longitudeVelocity * deltaSeconds),
      longitudeVelocity: state.longitudeVelocity,
    };
    covariance = {
      latPos: covariance.latPos + (deltaSeconds * covariance.latVel) + processNoise,
      latVel: covariance.latVel + processNoise * 0.1,
      lonPos: covariance.lonPos + (deltaSeconds * covariance.lonVel) + processNoise,
      lonVel: covariance.lonVel + processNoise * 0.1,
    };

    const latGain = covariance.latPos / (covariance.latPos + measurementNoise);
    const lonGain = covariance.lonPos / (covariance.lonPos + measurementNoise);
    const latitudeResidual = point.latitude - state.latitude;
    const longitudeResidual = point.longitude - state.longitude;

    state = {
      latitude: state.latitude + (latGain * latitudeResidual),
      latitudeVelocity: state.latitudeVelocity + ((latGain * latitudeResidual) / deltaSeconds),
      longitude: state.longitude + (lonGain * longitudeResidual),
      longitudeVelocity: state.longitudeVelocity + ((lonGain * longitudeResidual) / deltaSeconds),
    };
    covariance = {
      latPos: (1 - latGain) * covariance.latPos,
      latVel: covariance.latVel,
      lonPos: (1 - lonGain) * covariance.lonPos,
      lonVel: covariance.lonVel,
    };

    return {
      ...point,
      latitude: state.latitude,
      longitude: state.longitude,
    };
  });
}

function splitRuns(rowsOldestFirst: TrailBuildRow[]) {
  const runs: FilteredPoint[][] = [];
  let currentRun: FilteredPoint[] = [];

  for (const row of rowsOldestFirst) {
    if (
      Number.isNaN(row.latitude)
      || Number.isNaN(row.longitude)
      || Math.abs(row.latitude) > 90
      || Math.abs(row.longitude) > 180
    ) {
      continue;
    }

    const effectiveAccuracy = row.accuracyMeters ?? DEFAULT_ACCURACY_METERS;

    if (effectiveAccuracy > MAX_ACCEPTED_ACCURACY_METERS) {
      continue;
    }

    const lastPoint = currentRun[currentRun.length - 1];

    if (!lastPoint) {
      currentRun.push(row);
      continue;
    }

    const gapMs = row.occurredAt.getTime() - lastPoint.occurredAt.getTime();
    const displacementMeters = distanceMeters(lastPoint, row);

    if (gapMs > PATH_BREAK_TIME_MS || displacementMeters > PATH_BREAK_DISTANCE_METERS) {
      if (currentRun.length > 0) {
        runs.push(currentRun);
      }
      currentRun = [row];
      continue;
    }

    if (displacementMeters <= DEDUPE_DISTANCE_METERS) {
      currentRun[currentRun.length - 1] = row;
      continue;
    }

    currentRun.push(row);
  }

  if (currentRun.length > 0) {
    runs.push(currentRun);
  }

  return runs;
}

function removeBounceSpikes(run: FilteredPoint[]) {
  const points = [...run];
  let changed = true;

  while (changed) {
    changed = false;

    for (let index = 1; index < points.length - 1; index += 1) {
      const previous = points[index - 1]!;
      const current = points[index]!;
      const next = points[index + 1]!;
      const previousToCurrent = distanceMeters(previous, current);
      const currentToNext = distanceMeters(current, next);
      const previousToNext = distanceMeters(previous, next);
      const detour = previousToCurrent + currentToNext;
      const windowMs = next.occurredAt.getTime() - previous.occurredAt.getTime();

      if (
        previousToCurrent > BOUNCE_DETOUR_MIN_METERS
        && currentToNext > BOUNCE_DETOUR_MIN_METERS
        && windowMs <= BOUNCE_WINDOW_MS
        && (
          previousToNext <= BOUNCE_RETURN_MAX_METERS
          || (detour > 0 && previousToNext / detour <= 0.2)
        )
      ) {
        points.splice(index, 1);
        changed = true;
        break;
      }
    }
  }

  return points;
}

function collapseStationaryJitter(run: FilteredPoint[]) {
  const collapsed: FilteredPoint[] = [];

  for (const point of run) {
    const lastPoint = collapsed[collapsed.length - 1];

    if (!lastPoint) {
      collapsed.push(point);
      continue;
    }

    const displacementMeters = distanceMeters(lastPoint, point);
    const jitterThresholdMeters = Math.max(STATIONARY_JITTER_MIN_METERS, point.accuracyMeters ?? DEFAULT_ACCURACY_METERS);

    if (displacementMeters <= jitterThresholdMeters && point.stepCounter === lastPoint.stepCounter) {
      collapsed[collapsed.length - 1] = point;
      continue;
    }

    collapsed.push(point);
  }

  return collapsed;
}

function buildFilteredRuns(rowsOldestFirst: TrailBuildRow[]) {
  return splitRuns(rowsOldestFirst)
    .map((run) => collapseStationaryJitter(removeBounceSpikes(run)))
    .map((run) => applyKalmanFilter(run))
    .map((run) => simplifyRun(run, DOUGLAS_PEUCKER_TOLERANCE_METERS))
    .filter((run) => run.length >= 2);
}

function isMostlyInsideExpandedGeofence(
  run: FilteredPoint[],
  geofence: TrailGeometryContext["geofence"],
) {
  if (
    !geofence
    || geofence.status !== "enabled"
    || geofence.centerLatitude == null
    || geofence.centerLongitude == null
    || geofence.radiusMeters == null
  ) {
    return false;
  }

  const expandedRadiusMeters = geofence.radiusMeters + 25;
  let insideCount = 0;

  for (const point of run) {
    const pointDistanceMeters = haversineDistanceMeters({
      fromLatitude: geofence.centerLatitude,
      fromLongitude: geofence.centerLongitude,
      toLatitude: point.latitude,
      toLongitude: point.longitude,
    });

    if (pointDistanceMeters <= expandedRadiusMeters) {
      insideCount += 1;
    }
  }

  return insideCount / run.length > 0.5;
}

function rawRunDistanceMeters(run: FilteredPoint[]) {
  let total = 0;

  for (let index = 1; index < run.length; index += 1) {
    total += distanceMeters(run[index - 1]!, run[index]!);
  }

  return total;
}

function buildSnappedRun(
  run: FilteredPoint[],
  snappedPoints: RoadsSnappedPoint[],
) {
  if (snappedPoints.length < 2) {
    return null;
  }

  const mappedOriginals = new Map<number, RoadsSnappedPoint>();

  for (const point of snappedPoints) {
    if (point.originalIndex != null && !mappedOriginals.has(point.originalIndex)) {
      mappedOriginals.set(point.originalIndex, point);
    }
  }

  const displacements = run.map((point, index) => {
    const snappedPoint = mappedOriginals.get(index);

    if (!snappedPoint) {
      return null;
    }

    return distanceMeters(point, snappedPoint);
  }).filter((value): value is number => value !== null).sort((left, right) => left - right);

  if (displacements.length / run.length < 0.8) {
    return null;
  }

  const endpointDisplacementMeters = Math.max(
    distanceMeters(run[0]!, snappedPoints[0]!),
    distanceMeters(run[run.length - 1]!, snappedPoints[snappedPoints.length - 1]!),
  );
  const medianDisplacementMeters = displacements[Math.floor(displacements.length / 2)] ?? Number.POSITIVE_INFINITY;
  const p90DisplacementMeters = displacements[Math.floor(displacements.length * 0.9)] ?? Number.POSITIVE_INFINITY;
  const rawDistanceMeters = Math.max(rawRunDistanceMeters(run), 1);
  const snappedDistanceMeters = rawRunDistanceMeters(snappedPoints.map((point, index) => ({
    accuracyMeters: null,
    id: `snapped:${index}`,
    latitude: point.latitude,
    longitude: point.longitude,
    occurredAt: run[Math.min(point.originalIndex ?? run.length - 1, run.length - 1)]?.occurredAt ?? run[run.length - 1]!.occurredAt,
    stepCounter: run[Math.min(point.originalIndex ?? run.length - 1, run.length - 1)]?.stepCounter ?? run[run.length - 1]!.stepCounter,
  })));
  const lengthRatio = snappedDistanceMeters / rawDistanceMeters;
  const hasIncreasingSteps = run.some((point, index) => index > 0 && point.stepCounter > run[index - 1]!.stepCounter);
  const medianThresholdMeters = hasIncreasingSteps ? 8 : 12;
  const p90ThresholdMeters = hasIncreasingSteps ? 18 : 30;

  if (
    endpointDisplacementMeters > 25
    || medianDisplacementMeters > medianThresholdMeters
    || p90DisplacementMeters > p90ThresholdMeters
    || lengthRatio < 0.7
    || lengthRatio > 1.4
  ) {
    return null;
  }

  const snappedRun: FilteredPoint[] = snappedPoints.map((point, index) => {
    const previousAnchor = point.originalIndex != null
      ? point.originalIndex
      : (() => {
          for (let anchorIndex = index; anchorIndex >= 0; anchorIndex -= 1) {
            const anchor = snappedPoints[anchorIndex];

            if (anchor?.originalIndex != null) {
              return anchor.originalIndex;
            }
          }

          return 0;
        })();
    const nextAnchor = point.originalIndex != null
      ? point.originalIndex
      : (() => {
          for (let anchorIndex = index; anchorIndex < snappedPoints.length; anchorIndex += 1) {
            const anchor = snappedPoints[anchorIndex];

            if (anchor?.originalIndex != null) {
              return anchor.originalIndex;
            }
          }

          return run.length - 1;
        })();
    const fromSample = run[Math.max(0, Math.min(previousAnchor, run.length - 1))]!;
    const toSample = run[Math.max(0, Math.min(nextAnchor, run.length - 1))]!;
    const ratio = previousAnchor === nextAnchor
      ? 0
      : Math.max(0, Math.min(1, (index - previousAnchor) / Math.max(1, nextAnchor - previousAnchor)));

    return {
      accuracyMeters: null,
      id: `snapped:${index}`,
      latitude: point.latitude,
      longitude: point.longitude,
      occurredAt: new Date(
        fromSample.occurredAt.getTime()
          + ((toSample.occurredAt.getTime() - fromSample.occurredAt.getTime()) * ratio),
      ),
      stepCounter: fromSample.stepCounter,
    };
  });

  return simplifyRun(snappedRun, DOUGLAS_PEUCKER_TOLERANCE_METERS);
}

function trimSegmentsToDistance(segments: WorkingTrailSegment[], distanceMetersLimit: number) {
  if (distanceMetersLimit <= 0 || segments.length === 0) {
    return [];
  }

  const trimmedSegments: WorkingTrailSegment[] = [];
  let remainingDistanceMeters = distanceMetersLimit;

  for (let segmentIndex = segments.length - 1; segmentIndex >= 0; segmentIndex -= 1) {
    const segment = segments[segmentIndex]!;
    const keptPoints: FilteredPoint[] = [segment.points[segment.points.length - 1]!];

    for (let pointIndex = segment.points.length - 2; pointIndex >= 0; pointIndex -= 1) {
      const currentPoint = segment.points[pointIndex]!;
      const nextPoint = keptPoints[0]!;
      const segmentDistanceMeters = distanceMeters(currentPoint, nextPoint);

      if (segmentDistanceMeters <= 0) {
        keptPoints.unshift(currentPoint);
        continue;
      }

      if (remainingDistanceMeters > segmentDistanceMeters) {
        remainingDistanceMeters -= segmentDistanceMeters;
        keptPoints.unshift(currentPoint);
        continue;
      }

      const ratio = remainingDistanceMeters / segmentDistanceMeters;
      keptPoints.unshift(interpolatePoint(nextPoint, currentPoint, ratio));
      remainingDistanceMeters = 0;
      break;
    }

    if (keptPoints.length >= 2) {
      trimmedSegments.unshift({
        source: segment.source,
        points: keptPoints,
      });
    }

    if (remainingDistanceMeters <= 0) {
      break;
    }
  }

  return trimmedSegments;
}

export function toCachedSegments(segments: WorkingTrailSegment[]): CachedTrailSegment[] {
  return segments.map((segment) => ({
    source: segment.source,
    points: segment.points.map((point) => ({
      latitude: point.latitude,
      longitude: point.longitude,
      occurredAt: point.occurredAt.toISOString(),
    })),
  }));
}

/**
 * True when every cached point was observed at or after `windowStart`. Used to
 * keep a cache built from earlier (unpaid or pre-enforcement) points out of a
 * trail that billing limits to the current coverage window.
 */
export function cachedSegmentsWithinWindow(segments: unknown, windowStart: Date) {
  if (!Array.isArray(segments)) return false;
  const startMs = windowStart.getTime();
  return (segments as CachedTrailSegment[]).every((segment) => Array.isArray(segment?.points) && segment.points.every((point) => {
    const occurredMs = Date.parse(point.occurredAt);
    return Number.isFinite(occurredMs) && occurredMs >= startMs;
  }));
}

export function fromCachedSegments(segments: CachedTrailSegment[]): WorkingTrailSegment[] {
  return segments.map((segment) => ({
    source: segment.source,
    points: segment.points.map((point, index) => ({
      accuracyMeters: null,
      id: `cached:${index}:${point.occurredAt}`,
      latitude: point.latitude,
      longitude: point.longitude,
      occurredAt: new Date(point.occurredAt),
      stepCounter: 0,
    })),
  })).filter((segment) => segment.points.length >= 2);
}

function annotateSegmentsWithDistance(segments: WorkingTrailSegment[]) {
  const annotatedSegments: ChildTrailSegmentDto[] = [];
  let cumulativeDistanceMeters = 0;

  for (let segmentIndex = segments.length - 1; segmentIndex >= 0; segmentIndex -= 1) {
    const segment = segments[segmentIndex]!;
    const pointsNewestFirst: ChildTrailPointDto[] = [{
      distanceFromLatestMeters: cumulativeDistanceMeters,
      latitude: segment.points[segment.points.length - 1]!.latitude,
      longitude: segment.points[segment.points.length - 1]!.longitude,
      occurredAt: segment.points[segment.points.length - 1]!.occurredAt.toISOString(),
    }];

    for (let pointIndex = segment.points.length - 2; pointIndex >= 0; pointIndex -= 1) {
      const currentPoint = segment.points[pointIndex]!;
      const previousPoint = pointsNewestFirst[pointsNewestFirst.length - 1]!;
      cumulativeDistanceMeters += distanceMeters(currentPoint, previousPoint);
      pointsNewestFirst.push({
        distanceFromLatestMeters: cumulativeDistanceMeters,
        latitude: currentPoint.latitude,
        longitude: currentPoint.longitude,
        occurredAt: currentPoint.occurredAt.toISOString(),
      });
    }

    annotatedSegments.unshift({
      source: segment.source,
      points: [...pointsNewestFirst].reverse(),
    });
  }

  return annotatedSegments;
}

export function buildTrailResponseFromCachedSegments(input: {
  childId: string;
  distanceMeters: number;
  generatedAt: string;
  geometrySource: ChildTrailGeometrySource;
  segments: CachedTrailSegment[];
}): ChildTrailResponseDto {
  const trimmedSegments = trimSegmentsToDistance(fromCachedSegments(input.segments), input.distanceMeters);
  const annotatedSegments = annotateSegmentsWithDistance(trimmedSegments);

  return {
    childId: input.childId,
    distanceMeters: input.distanceMeters,
    generatedAt: input.generatedAt,
    geometrySource: input.geometrySource,
    segments: annotatedSegments,
    points: annotatedSegments.flatMap((segment) => segment.points),
  };
}

export function buildFilteredTrailSegments(
  rowsOldestFirst: TrailBuildRow[],
) {
  return buildFilteredRuns(rowsOldestFirst).map<WorkingTrailSegment>((run) => ({
    source: "filtered",
    points: run,
  }));
}

export async function buildTrailGeometry(
  rowsOldestFirst: TrailBuildRow[],
  context: TrailGeometryContext,
): Promise<TrailGeometryBuildResult> {
  const filteredRuns = buildFilteredRuns(rowsOldestFirst);
  const builtSegments: WorkingTrailSegment[] = [];
  let hasRoadSegments = false;

  for (const run of filteredRuns) {
    const localSegment: WorkingTrailSegment = {
      source: "filtered",
      points: run,
    };

    if (
      context.geometryMode === "roads"
      && context.roadsEnabled
      && context.roadSnapper
      && run.length >= 3
      && !isMostlyInsideExpandedGeofence(run, context.geofence)
    ) {
      try {
        const snappedPoints = await context.roadSnapper(run.map((point) => ({
          latitude: point.latitude,
          longitude: point.longitude,
        })));
        const snappedRun = buildSnappedRun(run, snappedPoints);

        if (snappedRun && snappedRun.length >= 2) {
          builtSegments.push({
            source: "roads",
            points: snappedRun,
          });
          hasRoadSegments = true;
          continue;
        }
      } catch {
        builtSegments.push(localSegment);
        continue;
      }
    }

    builtSegments.push(localSegment);
  }

  const geometrySource: ChildTrailGeometrySource = hasRoadSegments
    ? builtSegments.some((segment) => segment.source === "filtered")
      ? "hybrid"
      : "roads"
    : "filtered";

  return {
    geometrySource,
    segments: toCachedSegments(builtSegments),
  };
}
