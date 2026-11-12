// Fixture: helpers that ARE safe to capture — a 'worklet'-annotated local, a
// 'worklet'-annotated import, and Reanimated's own built-ins.
import { clamp, useAnimatedStyle, withTiming, type SharedValue } from 'react-native-reanimated';

import { workletHelper } from './worklet-helper';

function localWorklet(value: number) {
  'worklet';
  return value * 3;
}

export function SafeWorkletHelper({ progress }: { progress: SharedValue<number> }) {
  return useAnimatedStyle(() => ({
    opacity: withTiming(clamp(localWorklet(workletHelper(progress.get())), 0, 1)),
  }));
}
