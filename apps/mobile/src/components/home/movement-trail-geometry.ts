import type { ChildTrailResponseDto } from '@stepwhere/types';

export type TrailCoordinate = {
  latitude: number;
  longitude: number;
};

export type LiveTrailSample = {
  latitude: number;
  longitude: number;
  occurredAt: string;
};

export type PreparedTrailDot = {
  coordinate: TrailCoordinate;
  distanceFromLatestMeters: number;
  progress: number;
};

type TrailSegmentSample = {
  coordinate: TrailCoordinate;
  occurredAtMs: number;
};

const DEFAULT_DOT_SPACING_METERS = 40;
/** Code-level switch for showing past-location dots on the Home map. */
export const HOME_PAST_LOCATION_DOTS_ENABLED = false;
/** Hard ceiling on rendered trail dots, regardless of trail length. */
export const MAX_TRAIL_DOTS = 120;
const DEFAULT_MINIMUM_DISTANCE_METERS = 5;
const DEDUPE_DISTANCE_METERS = 2;
const PATH_BREAK_DISTANCE_METERS = 300;
const PATH_BREAK_TIME_MS = 30_000;
const BOUNCE_DETOUR_MIN_METERS = 35;
const BOUNCE_RETURN_MAX_METERS = 25;
const BOUNCE_WINDOW_MS = 120_000;
const EARTH_RADIUS_METERS = 6_371_000;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function haversineDistanceMeters(from: TrailCoordinate, to: TrailCoordinate) {
  const dLat = toRadians(to.latitude - from.latitude);
  const dLng = toRadians(to.longitude - from.longitude);
  const lat1 = toRadians(from.latitude);
  const lat2 = toRadians(to.latitude);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 2 * EARTH_RADIUS_METERS * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function isValidCoordinate(coordinate: TrailCoordinate) {
  return Number.isFinite(coordinate.latitude)
    && Number.isFinite(coordinate.longitude)
    && Math.abs(coordinate.latitude) <= 90
    && Math.abs(coordinate.longitude) <= 180;
}

function areSameCoordinate(left: TrailCoordinate | undefined, right: TrailCoordinate | undefined) {
  return Boolean(
    left
    && right
    && left.latitude === right.latitude
    && left.longitude === right.longitude,
  );
}

function interpolateCoordinate(from: TrailCoordinate, to: TrailCoordinate, ratio: number): TrailCoordinate {
  return {
    latitude: from.latitude + ((to.latitude - from.latitude) * ratio),
    longitude: from.longitude + ((to.longitude - from.longitude) * ratio),
  };
}

function parseOccurredAtMs(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const nextMs = new Date(value).getTime();
  return Number.isFinite(nextMs) ? nextMs : null;
}

function normalizeConfirmedSegment(segment: ChildTrailResponseDto['segments'][number]) {
  const samples: TrailSegmentSample[] = [];

  for (const point of segment.points) {
    const coordinate = {
      latitude: point.latitude,
      longitude: point.longitude,
    };
    const occurredAtMs = parseOccurredAtMs(point.occurredAt);

    if (!isValidCoordinate(coordinate) || occurredAtMs == null) {
      continue;
    }

    const lastSample = samples[samples.length - 1];

    if (lastSample && areSameCoordinate(lastSample.coordinate, coordinate)) {
      lastSample.occurredAtMs = occurredAtMs;
      continue;
    }

    samples.push({
      coordinate,
      occurredAtMs,
    });
  }

  return samples.length >= 2 ? samples : [];
}

function normalizeLiveSamples(
  liveSamples: LiveTrailSample[] | undefined,
  liveCoordinate: TrailCoordinate | null | undefined,
  liveOccurredAt: string | null | undefined,
  latestConfirmedOccurredAtMs: number | null,
) {
  const nextSamples: TrailSegmentSample[] = [];

  for (const sample of liveSamples ?? []) {
    const coordinate = {
      latitude: sample.latitude,
      longitude: sample.longitude,
    };
    const occurredAtMs = parseOccurredAtMs(sample.occurredAt);

    if (!isValidCoordinate(coordinate) || occurredAtMs == null) {
      continue;
    }

    if (latestConfirmedOccurredAtMs != null && occurredAtMs <= latestConfirmedOccurredAtMs) {
      continue;
    }

    nextSamples.push({
      coordinate,
      occurredAtMs,
    });
  }

  const liveCoordinateOccurredAtMs = parseOccurredAtMs(liveOccurredAt);

  if (
    liveCoordinate
    && isValidCoordinate(liveCoordinate)
    && liveCoordinateOccurredAtMs != null
    && (latestConfirmedOccurredAtMs == null || liveCoordinateOccurredAtMs > latestConfirmedOccurredAtMs)
  ) {
    nextSamples.push({
      coordinate: liveCoordinate,
      occurredAtMs: liveCoordinateOccurredAtMs,
    });
  }

  nextSamples.sort((left, right) => left.occurredAtMs - right.occurredAtMs);

  const deduped: TrailSegmentSample[] = [];

  for (const sample of nextSamples) {
    const lastSample = deduped[deduped.length - 1];

    if (
      lastSample
      && haversineDistanceMeters(lastSample.coordinate, sample.coordinate) <= DEDUPE_DISTANCE_METERS
    ) {
      deduped[deduped.length - 1] = sample;
      continue;
    }

    deduped.push(sample);
  }

  return deduped;
}

function removeBounceSpikes(samples: TrailSegmentSample[]) {
  const nextSamples = [...samples];
  let changed = true;

  while (changed) {
    changed = false;

    for (let index = 1; index < nextSamples.length - 1; index += 1) {
      const previous = nextSamples[index - 1]!;
      const current = nextSamples[index]!;
      const next = nextSamples[index + 1]!;
      const previousToCurrent = haversineDistanceMeters(previous.coordinate, current.coordinate);
      const currentToNext = haversineDistanceMeters(current.coordinate, next.coordinate);
      const previousToNext = haversineDistanceMeters(previous.coordinate, next.coordinate);
      const detour = previousToCurrent + currentToNext;
      const windowMs = next.occurredAtMs - previous.occurredAtMs;

      if (
        previousToCurrent > BOUNCE_DETOUR_MIN_METERS
        && currentToNext > BOUNCE_DETOUR_MIN_METERS
        && windowMs <= BOUNCE_WINDOW_MS
        && (
          previousToNext <= BOUNCE_RETURN_MAX_METERS
          || (detour > 0 && previousToNext / detour <= 0.2)
        )
      ) {
        nextSamples.splice(index, 1);
        changed = true;
        break;
      }
    }
  }

  return nextSamples;
}

function splitLiveRuns(samples: TrailSegmentSample[]) {
  const runs: TrailSegmentSample[][] = [];
  let currentRun: TrailSegmentSample[] = [];

  for (const sample of samples) {
    const lastSample = currentRun[currentRun.length - 1];

    if (!lastSample) {
      currentRun.push(sample);
      continue;
    }

    const gapMs = sample.occurredAtMs - lastSample.occurredAtMs;
    const displacementMeters = haversineDistanceMeters(lastSample.coordinate, sample.coordinate);

    if (gapMs > PATH_BREAK_TIME_MS || displacementMeters > PATH_BREAK_DISTANCE_METERS) {
      if (currentRun.length > 0) {
        runs.push(currentRun);
      }
      currentRun = [sample];
      continue;
    }

    currentRun.push(sample);
  }

  if (currentRun.length > 0) {
    runs.push(currentRun);
  }

  return runs;
}

function buildDisplaySegments(input: {
  trail: ChildTrailResponseDto | null | undefined;
  liveSamples?: LiveTrailSample[];
  liveCoordinate?: TrailCoordinate | null;
  liveOccurredAt?: string | null;
}) {
  const confirmedSegments = (input.trail?.segments ?? [])
    .map(normalizeConfirmedSegment)
    .filter((segment) => segment.length >= 2);
  const latestConfirmed = confirmedSegments[confirmedSegments.length - 1]?.[confirmedSegments[confirmedSegments.length - 1]!.length - 1] ?? null;
  const latestConfirmedOccurredAtMs = latestConfirmed?.occurredAtMs ?? null;
  const liveSamples = removeBounceSpikes(normalizeLiveSamples(
    input.liveSamples,
    input.liveCoordinate,
    input.liveOccurredAt,
    latestConfirmedOccurredAtMs,
  ));
  const liveRuns = splitLiveRuns(liveSamples);

  if (confirmedSegments.length === 0) {
    return liveRuns;
  }

  const displaySegments = confirmedSegments.map((segment) => [...segment]);
  const lastConfirmedSegment = displaySegments[displaySegments.length - 1];
  const latestConfirmedPoint = lastConfirmedSegment?.[lastConfirmedSegment.length - 1] ?? null;

  if (!latestConfirmedPoint) {
    return liveRuns;
  }

  for (const [index, liveRun] of liveRuns.entries()) {
    const firstPoint = liveRun[0]!;
    const gapMs = firstPoint.occurredAtMs - latestConfirmedPoint.occurredAtMs;
    const displacementMeters = haversineDistanceMeters(latestConfirmedPoint.coordinate, firstPoint.coordinate);
    const isContinuous = gapMs <= PATH_BREAK_TIME_MS && displacementMeters <= PATH_BREAK_DISTANCE_METERS;

    if (index === 0 && isContinuous) {
      if (displacementMeters <= DEDUPE_DISTANCE_METERS) {
        lastConfirmedSegment!.push(...liveRun.slice(1));
      } else {
        lastConfirmedSegment!.push(...liveRun);
      }
      continue;
    }

    displaySegments.push(liveRun);
  }

  return displaySegments.filter((segment) => segment.length >= 2);
}

type AnnotatedTrailSegmentSample = TrailSegmentSample & {
  distanceFromLatestMeters: number;
};

function annotateDistanceFromLatest(segments: TrailSegmentSample[][]) {
  const annotatedSegments: AnnotatedTrailSegmentSample[][] = [];
  let cumulativeDistanceMeters = 0;

  for (let segmentIndex = segments.length - 1; segmentIndex >= 0; segmentIndex -= 1) {
    const segment = segments[segmentIndex]!;
    const pointsNewestFirst: AnnotatedTrailSegmentSample[] = [{
      ...segment[segment.length - 1]!,
      distanceFromLatestMeters: cumulativeDistanceMeters,
    }];

    for (let pointIndex = segment.length - 2; pointIndex >= 0; pointIndex -= 1) {
      const currentPoint = segment[pointIndex]!;
      const newerPoint = pointsNewestFirst[pointsNewestFirst.length - 1]!;
      cumulativeDistanceMeters += haversineDistanceMeters(currentPoint.coordinate, newerPoint.coordinate);
      pointsNewestFirst.push({
        ...currentPoint,
        distanceFromLatestMeters: cumulativeDistanceMeters,
      });
    }

    annotatedSegments.unshift([...pointsNewestFirst].reverse());
  }

  return annotatedSegments;
}

export function prepareMovementTrailDots(
  trail: ChildTrailResponseDto | null | undefined,
  options?: {
    liveCoordinate?: TrailCoordinate | null;
    liveOccurredAt?: string | null;
    liveSamples?: LiveTrailSample[];
    minimumDistanceMeters?: number;
    spacingMeters?: number;
  },
): PreparedTrailDot[] {
  const minimumDistanceMeters = options?.minimumDistanceMeters ?? DEFAULT_MINIMUM_DISTANCE_METERS;
  const requestedSpacingMeters = options?.spacingMeters ?? DEFAULT_DOT_SPACING_METERS;

  if (requestedSpacingMeters <= 0) {
    return [];
  }

  const displaySegments = buildDisplaySegments({
    liveCoordinate: options?.liveCoordinate,
    liveOccurredAt: options?.liveOccurredAt,
    liveSamples: options?.liveSamples,
    trail,
  });

  if (displaySegments.length === 0) {
    return [];
  }

  const annotatedSegments = annotateDistanceFromLatest(displaySegments);
  const maximumDistanceMeters = Math.max(
    ...annotatedSegments.flatMap((segment) => segment.map((sample) => sample.distanceFromLatestMeters)),
    0,
  );

  if (maximumDistanceMeters < minimumDistanceMeters) {
    return [];
  }

  // Each dot becomes a native map Circle. At fixed 40m spacing a 20km trail emits
  // ~500 of them, which is a real memory/raster cost on low-end Android. Widen
  // the spacing on long trails so the count stays bounded; the visual reads the
  // same because a long trail is zoomed out anyway.
  const spacingMeters = Math.max(
    requestedSpacingMeters,
    (maximumDistanceMeters - minimumDistanceMeters) / MAX_TRAIL_DOTS,
  );
  const dots: PreparedTrailDot[] = [];

  for (
    let targetDistanceMeters = minimumDistanceMeters;
    targetDistanceMeters <= maximumDistanceMeters;
    targetDistanceMeters += spacingMeters
  ) {
    let matched = false;

    for (let segmentIndex = annotatedSegments.length - 1; segmentIndex >= 0 && !matched; segmentIndex -= 1) {
      const segment = annotatedSegments[segmentIndex]!;

      for (let index = segment.length - 1; index > 0; index -= 1) {
        const newerPoint = segment[index]!;
        const olderPoint = segment[index - 1]!;

        if (
          targetDistanceMeters < newerPoint.distanceFromLatestMeters
          || targetDistanceMeters > olderPoint.distanceFromLatestMeters
        ) {
          continue;
        }

        const distanceSpan = olderPoint.distanceFromLatestMeters - newerPoint.distanceFromLatestMeters;

        if (distanceSpan <= 0) {
          continue;
        }

        dots.push({
          coordinate: interpolateCoordinate(
            newerPoint.coordinate,
            olderPoint.coordinate,
            (targetDistanceMeters - newerPoint.distanceFromLatestMeters) / distanceSpan,
          ),
          distanceFromLatestMeters: targetDistanceMeters,
          progress: clamp(1 - (targetDistanceMeters / maximumDistanceMeters), 0, 1),
        });
        matched = true;
        break;
      }
    }
  }

  return dots.sort((left, right) => right.distanceFromLatestMeters - left.distanceFromLatestMeters);
}
