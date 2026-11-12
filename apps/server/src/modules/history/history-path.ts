import {
  DEFAULT_ACCURACY_METERS,
  ISOLATED_SPIKE_SPEED_KMH,
  MAX_STORED_PATH_POINTS,
  MAX_USABLE_ACCURACY_METERS,
  PATH_SIMPLIFICATION_TOLERANCE_METERS,
} from "./history.constants";

export type HistorySample = {
  id: string;
  deviceId: string;
  latitude: number;
  longitude: number;
  accuracyMeters: number | null;
  stepCounter: number;
  deviceState: "active" | "sleep" | "offline";
  occurredAt: Date;
};

export type AcceptedHistorySample = HistorySample & {
  accuracyMeters: number;
};

export type HistoryPathPoint = {
  latitude: number;
  longitude: number;
  occurredAt?: string;
};

const EARTH_RADIUS_METERS = 6_371_000;

export function isValidCoordinate(latitude: number, longitude: number) {
  return Number.isFinite(latitude)
    && Number.isFinite(longitude)
    && latitude >= -90
    && latitude <= 90
    && longitude >= -180
    && longitude <= 180;
}

export function normalizeSample(sample: HistorySample): AcceptedHistorySample | null {
  if (!isValidCoordinate(sample.latitude, sample.longitude)) {
    return null;
  }

  const accuracyMeters = sample.accuracyMeters ?? DEFAULT_ACCURACY_METERS;

  if (!Number.isFinite(accuracyMeters) || accuracyMeters > MAX_USABLE_ACCURACY_METERS) {
    return null;
  }

  return {
    ...sample,
    accuracyMeters,
  };
}

export function distanceMeters(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);
  const dLat = toRadians(b.latitude - a.latitude);
  const dLon = toRadians(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;

  return 2 * EARTH_RADIUS_METERS * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function elapsedSeconds(a: Date, b: Date) {
  return Math.max(0, Math.floor((b.getTime() - a.getTime()) / 1000));
}

export function segmentSpeedKmh(a: AcceptedHistorySample, b: AcceptedHistorySample) {
  const seconds = elapsedSeconds(a.occurredAt, b.occurredAt);

  if (seconds <= 0) {
    return 0;
  }

  return (distanceMeters(a, b) / seconds) * 3.6;
}

export function filterAcceptedSamples(samples: HistorySample[]) {
  const normalized = samples.map(normalizeSample);

  return normalized.filter((sample, index): sample is AcceptedHistorySample => {
    if (!sample) {
      return false;
    }

    const previous = findNearestAccepted(normalized, index, -1);
    const next = findNearestAccepted(normalized, index, 1);

    if (!previous || !next) {
      return true;
    }

    const speedIn = segmentSpeedKmh(previous, sample);
    const speedOut = segmentSpeedKmh(sample, next);
    const directSpeed = segmentSpeedKmh(previous, next);

    return !(speedIn > ISOLATED_SPIKE_SPEED_KMH
      && speedOut > ISOLATED_SPIKE_SPEED_KMH
      && directSpeed < ISOLATED_SPIKE_SPEED_KMH / 3);
  });
}

export function calculateDistanceMeters(points: Array<{ latitude: number; longitude: number }>) {
  let total = 0;

  for (let index = 1; index < points.length; index += 1) {
    total += distanceMeters(points[index - 1]!, points[index]!);
  }

  return Math.round(total);
}

export function simplifyPath(samples: AcceptedHistorySample[]): HistoryPathPoint[] {
  if (samples.length <= 2) {
    return samples.map(toPathPoint);
  }

  const simplified = douglasPeucker(samples, PATH_SIMPLIFICATION_TOLERANCE_METERS).map(toPathPoint);

  if (simplified.length <= MAX_STORED_PATH_POINTS) {
    return simplified;
  }

  const step = Math.ceil(simplified.length / MAX_STORED_PATH_POINTS);
  const reduced = simplified.filter((_, index) => index === 0 || index === simplified.length - 1 || index % step === 0);

  return reduced.slice(0, MAX_STORED_PATH_POINTS - 1).concat(simplified[simplified.length - 1]!);
}

export function weightedMedoid(samples: AcceptedHistorySample[]) {
  let bestSample = samples[0] ?? null;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const candidate of samples) {
    let score = 0;

    for (const sample of samples) {
      const weight = 1 / Math.max(sample.accuracyMeters, 5) ** 2;
      score += distanceMeters(candidate, sample) * weight;
    }

    if (score < bestScore) {
      bestScore = score;
      bestSample = candidate;
    }
  }

  return bestSample;
}

export function percentile(values: number[], p: number) {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index]!;
}

function douglasPeucker(points: AcceptedHistorySample[], toleranceMeters: number): AcceptedHistorySample[] {
  if (points.length <= 2) {
    return points;
  }

  let maxDistance = 0;
  let splitIndex = 0;
  const first = points[0]!;
  const last = points[points.length - 1]!;

  for (let index = 1; index < points.length - 1; index += 1) {
    const currentDistance = perpendicularDistanceMeters(points[index]!, first, last);

    if (currentDistance > maxDistance) {
      maxDistance = currentDistance;
      splitIndex = index;
    }
  }

  if (maxDistance <= toleranceMeters) {
    return [first, last];
  }

  const left = douglasPeucker(points.slice(0, splitIndex + 1), toleranceMeters);
  const right = douglasPeucker(points.slice(splitIndex), toleranceMeters);

  return left.slice(0, -1).concat(right);
}

function perpendicularDistanceMeters(point: AcceptedHistorySample, start: AcceptedHistorySample, end: AcceptedHistorySample) {
  const lineDistance = distanceMeters(start, end);

  if (lineDistance === 0) {
    return distanceMeters(point, start);
  }

  const a = distanceMeters(start, point);
  const b = distanceMeters(point, end);
  const s = (lineDistance + a + b) / 2;
  const area = Math.sqrt(Math.max(0, s * (s - lineDistance) * (s - a) * (s - b)));

  return (2 * area) / lineDistance;
}

function findNearestAccepted(items: Array<AcceptedHistorySample | null>, fromIndex: number, direction: -1 | 1) {
  for (let index = fromIndex + direction; index >= 0 && index < items.length; index += direction) {
    if (items[index]) {
      return items[index];
    }
  }

  return null;
}

function toPathPoint(sample: AcceptedHistorySample) {
  return {
    latitude: sample.latitude,
    longitude: sample.longitude,
    occurredAt: sample.occurredAt.toISOString(),
  };
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}
