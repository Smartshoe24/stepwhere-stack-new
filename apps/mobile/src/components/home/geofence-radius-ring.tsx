import type { SharedValue } from 'react-native-reanimated';

export type GeofenceRadiusRingProps = {
  centerLatitude: number;
  centerLongitude: number;
  layoutHeight: SharedValue<number>;
  layoutWidth: SharedValue<number>;
  pending: boolean;
  radiusMeters: SharedValue<number>;
  regionLatitude: SharedValue<number>;
  regionLatitudeDelta: SharedValue<number>;
  regionLongitude: SharedValue<number>;
  regionLongitudeDelta: SharedValue<number>;
  status: 'breached' | 'enabled';
  visible: boolean;
};

export function GeofenceRadiusRing(_props: GeofenceRadiusRingProps) {
  return null;
}
