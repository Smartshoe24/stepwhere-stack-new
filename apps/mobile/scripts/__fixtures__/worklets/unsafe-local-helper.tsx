// Fixture: a plain local helper captured by a worklet. This is the exact shape of
// the `clamp` crash — declaring it in the same file does not make it safe.
import { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

function scaleValue(value: number) {
  return value * 2;
}

export function UnsafeLocalHelper({ progress }: { progress: SharedValue<number> }) {
  return useAnimatedStyle(() => ({ opacity: scaleValue(progress.get()) }));
}
