import tzLookup from "tz-lookup";

/**
 * The device does not report its timezone, so we derive it from the last known
 * coordinate. This is what "child timezone == device timezone" means in practice:
 * wherever the tracker physically is decides when the child's day rolls over.
 *
 * `tz-lookup` is an offline coarse-grid lookup (~73KB, no network, no API key), so
 * this is safe to call on every ingest.
 */

/** Used until a device reports a usable coordinate. */
export const FALLBACK_TIMEZONE = "UTC";

export function resolveTimezoneFromCoordinate(
  latitude: number | string | null | undefined,
  longitude: number | string | null | undefined,
): string | null {
  if (latitude === null || latitude === undefined) {
    return null;
  }

  if (longitude === null || longitude === undefined) {
    return null;
  }

  const latitudeValue = Number(latitude);
  const longitudeValue = Number(longitude);

  if (!Number.isFinite(latitudeValue) || !Number.isFinite(longitudeValue)) {
    return null;
  }

  // (0, 0) is the sentinel for "no GPS fix" elsewhere in ingest, and it also
  // resolves to a meaningless Etc/GMT, so treat it as unknown.
  if (latitudeValue === 0 && longitudeValue === 0) {
    return null;
  }

  if (latitudeValue < -90 || latitudeValue > 90) {
    return null;
  }

  if (longitudeValue < -180 || longitudeValue > 180) {
    return null;
  }

  try {
    return tzLookup(latitudeValue, longitudeValue);
  } catch {
    return null;
  }
}

/**
 * Picks the timezone to attribute a sample to, preferring a fresh fix and falling
 * back to whatever the child was last seen in. Never returns null so callers can
 * always resolve a local date.
 */
export function resolveChildTimezone(input: {
  latitude?: number | string | null;
  longitude?: number | string | null;
  storedTimezone?: string | null;
}) {
  return (
    resolveTimezoneFromCoordinate(input.latitude, input.longitude)
    ?? input.storedTimezone
    ?? FALLBACK_TIMEZONE
  );
}
