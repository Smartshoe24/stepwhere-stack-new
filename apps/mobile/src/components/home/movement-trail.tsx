import type { ChildTrailResponseDto } from '@stepwhere/types';

import React from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle as SvgCircle } from 'react-native-svg';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import {
  prepareMovementTrailDots,
  type LiveTrailSample,
  type TrailCoordinate,
} from '@/components/home/movement-trail-geometry';

type MovementTrailProps = {
  anchorCoordinate: TrailCoordinate;
  childId: string;
  liveCoordinate: TrailCoordinate | null;
  liveOccurredAt: string | null;
  liveSamples?: LiveTrailSample[];
  trail: ChildTrailResponseDto | null;
};

type TrailBounds = {
  height: number;
  width: number;
};

const TRAIL_DOT_RADIUS_PX = 3.5;

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

function projectPointMeters(point: TrailCoordinate, anchorCoordinate: TrailCoordinate) {
  const latitudeRadians = anchorCoordinate.latitude * (Math.PI / 180);
  const metersPerLatitudeDegree = 111_320;
  const metersPerLongitudeDegree = Math.max(111_320 * Math.cos(latitudeRadians), 1);

  return {
    x: (point.longitude - anchorCoordinate.longitude) * metersPerLongitudeDegree,
    y: (point.latitude - anchorCoordinate.latitude) * metersPerLatitudeDegree,
  };
}

function smoothstep(progress: number) {
  return progress * progress * (3 - (2 * progress));
}

function getDotOpacity(progress: number) {
  return Math.max(0, Math.min(1, 0.06 + (smoothstep(progress) * 0.82)));
}

export function MovementTrail({
  anchorCoordinate,
  childId: _childId,
  liveCoordinate,
  liveOccurredAt,
  liveSamples,
  trail,
}: MovementTrailProps) {
  const { theme } = useUnistyles();
  const [bounds, setBounds] = React.useState<TrailBounds>({ height: 0, width: 0 });
  const dots = React.useMemo(() => prepareMovementTrailDots(trail, {
    liveCoordinate,
    liveOccurredAt,
    liveSamples,
  }), [liveCoordinate, liveOccurredAt, liveSamples, trail]);

  if (dots.length === 0) {
    return null;
  }

  const projectedDots = dots.map((dot) => projectPointMeters(dot.coordinate, anchorCoordinate));
  const maxExtentMeters = Math.max(
    ...projectedDots.flatMap((point) => [Math.abs(point.x), Math.abs(point.y)]),
    1,
  );
  const centerX = bounds.width * 0.5;
  const centerY = bounds.height * 0.42;
  const scale = bounds.width > 0 && bounds.height > 0
    ? Math.min((bounds.width * 0.56) / (maxExtentMeters * 2), (bounds.height * 0.46) / (maxExtentMeters * 2))
    : 0;

  function handleLayout(event: LayoutChangeEvent) {
    const nextWidth = Math.round(event.nativeEvent.layout.width);
    const nextHeight = Math.round(event.nativeEvent.layout.height);

    setBounds((current) => (
      current.width === nextWidth && current.height === nextHeight
        ? current
        : { height: nextHeight, width: nextWidth }
    ));
  }

  return (
    <View onLayout={handleLayout} pointerEvents="none" style={styles.container}>
      {scale > 0 ? (
        <Svg height={bounds.height} style={styles.svg} width={bounds.width}>
          {dots.map((dot, index) => {
            const projectedDot = projectedDots[index];

            if (!projectedDot) {
              return null;
            }

            return (
              <SvgCircle
                cx={centerX + (projectedDot.x * scale)}
                cy={centerY - (projectedDot.y * scale)}
                fill={withAlpha(theme.colors.movementTrail.main, getDotOpacity(dot.progress))}
                key={`trail-dot:${dot.distanceFromLatestMeters}`}
                r={TRAIL_DOT_RADIUS_PX}
              />
            );
          })}
        </Svg>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create(() => ({
  container: {
    ...StyleSheet.absoluteFillObject,
  },
  svg: {
    ...StyleSheet.absoluteFillObject,
  },
}));
