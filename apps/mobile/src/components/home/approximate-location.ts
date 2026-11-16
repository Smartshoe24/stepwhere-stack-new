import type { OverviewChildCard } from '@/features/overview/overview-ui';

/**
 * A position that did not come from GPS (cell tower / Wi-Fi lookup) is only
 * accurate to a few hundred metres. Anything at or under this accuracy is
 * treated as precise, which covers Wi-Fi assisted lookups.
 */
export const PRECISE_ACCURACY_THRESHOLD_METERS = 50;

/** Used when the server did not report an accuracy for a non-GPS position. */
export const DEFAULT_APPROXIMATE_RADIUS_METERS = 200;

const MIN_CIRCLE_RADIUS_METERS = 25;
const MAX_CIRCLE_RADIUS_METERS = 5000;

export type ApproximateLocation = {
  radiusMeters: number;
  /**
   * True while the shoe is live and expected to get a GPS fix soon. When the
   * shoe is offline or asleep the circle still describes the last known
   * position, but "fetching" would be untrue.
   */
  searching: boolean;
};

type ApproximateLocationInput = Pick<
  OverviewChildCard,
  'hasLocationFix' | 'locationSource' | 'resolvedPosition' | 'telemetryState'
>;

/** Returns null when the position is precise (GPS, or an accurate Wi-Fi fix). */
export function getApproximateLocation(
  child: ApproximateLocationInput,
): ApproximateLocation | null {
  if (!child.hasLocationFix || !child.locationSource || child.locationSource === 'gps') {
    return null;
  }

  const accuracy = child.resolvedPosition?.accuracyMeters ?? null;

  if (accuracy !== null && accuracy <= PRECISE_ACCURACY_THRESHOLD_METERS) {
    return null;
  }

  const radiusMeters = Math.min(
    Math.max(accuracy ?? DEFAULT_APPROXIMATE_RADIUS_METERS, MIN_CIRCLE_RADIUS_METERS),
    MAX_CIRCLE_RADIUS_METERS,
  );

  return {
    radiusMeters,
    searching: child.telemetryState === 'active' || child.telemetryState === 'connecting',
  };
}
