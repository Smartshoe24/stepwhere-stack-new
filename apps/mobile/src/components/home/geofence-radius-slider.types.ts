import type { ColorValue, StyleProp, ViewStyle } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';

export type GeofenceRadiusSliderProps = {
  activeTrackColor: ColorValue;
  inactiveTrackColor: ColorValue;
  maximumValue: number;
  minimumValue: number;
  liveValue: SharedValue<number>;
  onInteractionCancel: () => void;
  onInteractionEnd: () => void;
  onInteractionStart: () => void;
  onValueChange: (value: number) => void;
  step: number;
  style?: StyleProp<ViewStyle>;
  thumbColor: ColorValue;
  value: number;
};
