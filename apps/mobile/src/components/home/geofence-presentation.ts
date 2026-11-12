import type { useUnistyles } from 'react-native-unistyles';

import type { GeofenceUiStatus } from '@/components/home/geofence-state';

type Theme = ReturnType<typeof useUnistyles>['theme'];

const PENDING_RING_ALPHA_MULTIPLIER = 0.4;

function multiplyRgbaAlpha(color: string, multiplier: number) {
  const match = color.match(
    /^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)$/,
  );

  if (!match) {
    return color;
  }

  const [, red, green, blue, alpha] = match;
  const nextAlpha = Math.round(
    Math.max(0, Math.min(1, Number(alpha) * multiplier)) * 10_000,
  ) / 10_000;

  return `rgba(${red}, ${green}, ${blue}, ${nextAlpha})`;
}

/**
 * Which token family a geofence state draws from. Kept separate from
 * `GeofenceUiStatus` because `disabled` and `unset` share one visual treatment in
 * some surfaces but not others.
 */
export type GeofenceTone = keyof Theme['colors']['geofence']['pillSurface'];

/**
 * Single source of truth for geofence colors.
 *
 * Previously each surface hardcoded `color: "#FFFFFF"` over a saturated accent.
 * In dark mode that measured 1.74:1 on `enabled` — the accents are *lighter* in
 * dark mode, so white-on-accent inverts exactly backwards. Every state failed
 * AA in both themes. These pairs are all verified >= 4.5:1.
 */
export function getGeofenceToneColors(theme: Theme, tone: GeofenceTone) {
  return {
    /** Tinted chip background. */
    pillSurface: theme.colors.geofence.pillSurface[tone],
    /** Accent text/icon that sits on `pillSurface`. */
    pillText: theme.colors.geofence.pillText[tone],
    /** Saturated background for the FAB and active segments. */
    fill: theme.colors.geofence.fill[tone],
    /** Ink that sits on `fill`. */
    onFill: theme.colors.geofence.onFill[tone],
  };
}

export function getGeofenceFillColors(
  theme: Theme,
  key: keyof Theme['colors']['geofence']['fill'],
) {
  return {
    fill: theme.colors.geofence.fill[key],
    onFill: theme.colors.geofence.onFill[key],
  };
}

/** Map ring colors, including the quiet pending treatment used during a drag. */
export function getGeofenceRingColors(
  theme: Theme,
  status: 'breached' | 'enabled',
  pending = false,
) {
  const fill = status === 'breached'
    ? theme.colors.geofence.breachedRingFill
    : theme.colors.geofence.ringFill;
  const stroke = status === 'breached'
    ? theme.colors.geofence.breachedRingStroke
    : theme.colors.geofence.ringStroke;

  if (!pending) {
    return { fill, stroke };
  }

  return {
    fill: multiplyRgbaAlpha(fill, PENDING_RING_ALPHA_MULTIPLIER),
    stroke: multiplyRgbaAlpha(stroke, PENDING_RING_ALPHA_MULTIPLIER),
  };
}

/**
 * The status card never shows `editing` (it is replaced by the radius editor),
 * so its tone map is narrower than the FAB's.
 */
export function getGeofenceStatusTone(
  status: Exclude<GeofenceUiStatus, 'editing'>,
): GeofenceTone {
  return status;
}

/** Maps a geofence state onto the shared `theme.status[*]` dot vocabulary. */
export function getGeofenceStatusDotTone(
  status: Exclude<GeofenceUiStatus, 'editing'>,
) {
  if (status === 'breached') {
    return 'alert' as const;
  }

  if (status === 'enabled') {
    return 'safe' as const;
  }

  if (status === 'disabled') {
    return 'transit' as const;
  }

  return 'offline' as const;
}
