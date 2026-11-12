// Fixture: a plain helper imported from a local module and captured by a worklet.
import { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

import { plainHelper } from './plain-helper';

export function UnsafeImportedHelper({ progress }: { progress: SharedValue<number> }) {
  return useAnimatedStyle(() => ({ opacity: plainHelper(progress.get()) }));
}
