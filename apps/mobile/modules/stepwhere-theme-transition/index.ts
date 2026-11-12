import { requireOptionalNativeModule } from 'expo-modules-core';

export type StepwhereThemeTransitionNativeModule = {
  cancel(): Promise<void>;
  commit(durationMs: number): Promise<void>;
  prepare(cx: number, cy: number, overlayColor?: string | null): Promise<void>;
};

export default requireOptionalNativeModule<StepwhereThemeTransitionNativeModule>(
  'StepwhereThemeTransition'
);
