import React from 'react';
import { View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { getGeofenceRingColors } from '@/components/home/geofence-presentation';

type SafeZoneRingsProps = {
  pending?: boolean;
  radiusMeters: number;
  status?: "enabled" | "breached";
  visible: boolean;
};

function interpolateRadius(radiusMeters: number) {
  const clamped = Math.min(Math.max(radiusMeters, 0), 10000);
  return 48 + Math.sqrt(clamped / 10000) * 172;
}

export function SafeZoneRings({
  pending = false,
  radiusMeters,
  status = "enabled",
  visible,
}: SafeZoneRingsProps) {
  const { theme } = useUnistyles();

  if (!visible || radiusMeters <= 0) {
    return null;
  }

  const size = interpolateRadius(radiusMeters);
  const ringColors = getGeofenceRingColors(theme, status, pending);

  return (
    <View pointerEvents="none" style={styles.container(size)}>
      <View style={styles.zone(size, ringColors.fill, ringColors.stroke)}>
        <View style={styles.fadeCore(size, ringColors.fill)} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create(theme => ({
  container: (size: number) => ({
    position: 'absolute',
    top: '42%',
    left: '50%',
    width: size,
    height: size,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ translateX: -size / 2 }, { translateY: -size / 2 }],
  }),
  zone: (size: number, backgroundColor: string, borderColor: string) => ({
    width: size,
    height: size,
    borderRadius: theme.radius.circle,
    borderWidth: 2,
    borderStyle: 'dotted',
    borderColor,
    backgroundColor,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  }),
  fadeCore: (size: number, backgroundColor: string) => ({
    width: size * 0.56,
    height: size * 0.56,
    borderRadius: theme.radius.circle,
    backgroundColor,
    opacity: 0.45,
  }),
}));
