import { Canvas, Circle, DashPathEffect } from '@shopify/react-native-skia';
import React from 'react';
import { useDerivedValue } from 'react-native-reanimated';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import {
  getMetersPerPixelForRegion,
  getPreviewRadiusPx,
  projectCoordinateToScreen,
} from '@/components/home/geofence-preview-geometry';
import { getGeofenceRingColors } from '@/components/home/geofence-presentation';
import type { GeofenceRadiusRingProps } from '@/components/home/geofence-radius-ring';

const RING_STROKE_WIDTH = 2;
const RING_DASH_INTERVALS = [2, 8];

/**
 * The sole native geofence renderer. Radius and camera changes stay on shared
 * values, so dragging never rebuilds a Google Maps overlay or the React tree.
 */
export function GeofenceRadiusRing({
  centerLatitude,
  centerLongitude,
  layoutHeight,
  layoutWidth,
  pending,
  radiusMeters,
  regionLatitude,
  regionLatitudeDelta,
  regionLongitude,
  regionLongitudeDelta,
  status,
  visible,
}: GeofenceRadiusRingProps) {
  const { theme } = useUnistyles();
  const ringColors = getGeofenceRingColors(theme, status, pending);
  const centerX = useDerivedValue(() => projectCoordinateToScreen({
    heightPx: layoutHeight.get(),
    latitude: centerLatitude,
    longitude: centerLongitude,
    region: {
      latitude: regionLatitude.get(),
      latitudeDelta: regionLatitudeDelta.get(),
      longitude: regionLongitude.get(),
      longitudeDelta: regionLongitudeDelta.get(),
    },
    widthPx: layoutWidth.get(),
  }).x);
  const centerY = useDerivedValue(() => projectCoordinateToScreen({
    heightPx: layoutHeight.get(),
    latitude: centerLatitude,
    longitude: centerLongitude,
    region: {
      latitude: regionLatitude.get(),
      latitudeDelta: regionLatitudeDelta.get(),
      longitude: regionLongitude.get(),
      longitudeDelta: regionLongitudeDelta.get(),
    },
    widthPx: layoutWidth.get(),
  }).y);
  const radius = useDerivedValue(() => getPreviewRadiusPx({
    metersPerPixel: getMetersPerPixelForRegion({
      latitude: regionLatitude.get(),
      longitudeDelta: regionLongitudeDelta.get(),
      widthPx: layoutWidth.get(),
    }),
    radiusMeters: radiusMeters.get(),
  }));

  if (!visible) {
    return null;
  }

  return (
    <Canvas pointerEvents="none" style={styles.canvas}>
      <Circle color={ringColors.fill} cx={centerX} cy={centerY} r={radius} />
      <Circle
        color={ringColors.stroke}
        cx={centerX}
        cy={centerY}
        r={radius}
        strokeWidth={RING_STROKE_WIDTH}
        style="stroke"
      >
        <DashPathEffect intervals={RING_DASH_INTERVALS} />
      </Circle>
    </Canvas>
  );
}

const styles = StyleSheet.create({
  canvas: {
    ...StyleSheet.absoluteFillObject,
  },
});
