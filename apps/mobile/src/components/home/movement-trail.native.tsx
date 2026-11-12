import type { ChildTrailResponseDto } from '@stepwhere/types';

import React from 'react';
import { Circle } from 'react-native-maps';
import { useUnistyles } from 'react-native-unistyles';

import {
  prepareMovementTrailDots,
  type LiveTrailSample,
  type TrailCoordinate,
} from '@/components/home/movement-trail-geometry';

type MovementTrailProps = {
  childId: string;
  /**
   * Passed as primitives rather than a coordinate object so the surrounding
   * `React.memo` can actually bail out. An inline `{ latitude, longitude }`
   * literal at the call site made this component recompute its whole dot set on
   * every parent render.
   */
  liveLatitude: number | null;
  liveLongitude: number | null;
  liveOccurredAt: string | null;
  liveSamples?: LiveTrailSample[];
  trail: ChildTrailResponseDto | null;
};

const TRAIL_DOT_RADIUS_METERS = 4;

function withAlpha(hexColor: string, alpha: number) {
  const normalized = hexColor.replace('#', '');
  const expanded = normalized.length === 3
    ? normalized.split('').map((value) => `${value}${value}`).join('')
    : normalized;

  if (expanded.length !== 6) {
    return hexColor;
  }

  const red = Number.parseInt(expanded.slice(0, 2), 16);
  const green = Number.parseInt(expanded.slice(2, 4), 16);
  const blue = Number.parseInt(expanded.slice(4, 6), 16);

  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function smoothstep(progress: number) {
  return progress * progress * (3 - (2 * progress));
}

function getDotOpacity(progress: number) {
  return Math.max(0, Math.min(1, 0.06 + (smoothstep(progress) * 0.82)));
}

function MovementTrailComponent({
  liveLatitude,
  liveLongitude,
  liveOccurredAt,
  liveSamples,
  trail,
}: MovementTrailProps) {
  const { theme } = useUnistyles();
  const liveCoordinate = React.useMemo<TrailCoordinate | null>(
    () => (liveLatitude != null && liveLongitude != null
      ? { latitude: liveLatitude, longitude: liveLongitude }
      : null),
    [liveLatitude, liveLongitude],
  );
  const dots = React.useMemo(
    () => prepareMovementTrailDots(trail, {
      liveCoordinate,
      liveOccurredAt,
      liveSamples,
    }),
    [liveCoordinate, liveOccurredAt, liveSamples, trail],
  );

  if (dots.length === 0) {
    return null;
  }

  return (
    <>
      {dots.map((dot) => (
        <Circle
          center={dot.coordinate}
          fillColor={withAlpha(theme.colors.movementTrail.main, getDotOpacity(dot.progress))}
          key={`trail-dot:${dot.distanceFromLatestMeters}`}
          radius={TRAIL_DOT_RADIUS_METERS}
          strokeColor="rgba(0, 0, 0, 0)"
          strokeWidth={0}
          zIndex={4}
        />
      ))}
    </>
  );
}

export const MovementTrail = React.memo(MovementTrailComponent);
