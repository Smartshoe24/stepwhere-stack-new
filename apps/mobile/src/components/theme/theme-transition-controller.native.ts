import { requireOptionalNativeModule } from 'expo-modules-core';

export type ThemeTransitionPrepareOptions = {
  cx: number;
  cy: number;
  overlayColor?: string;
};

export type ThemeTransitionCommitOptions = {
  durationMs: number;
};

type NativeThemeTransitionModule = {
  cancel(): Promise<void>;
  commit(durationMs: number): Promise<void>;
  prepare(cx: number, cy: number, overlayColor?: string | null): Promise<void>;
};

const nativeModule = requireOptionalNativeModule<NativeThemeTransitionModule>(
  'StepwhereThemeTransition'
);

export const themeTransitionController = {
  isAvailable: nativeModule != null,
  async cancel() {
    if (!nativeModule) {
      return;
    }

    await nativeModule.cancel();
  },
  async commit(options: ThemeTransitionCommitOptions) {
    if (!nativeModule) {
      return;
    }

    await nativeModule.commit(options.durationMs);
  },
  async prepare(options: ThemeTransitionPrepareOptions) {
    if (!nativeModule) {
      return;
    }

    await nativeModule.prepare(options.cx, options.cy, options.overlayColor ?? null);
  },
};
