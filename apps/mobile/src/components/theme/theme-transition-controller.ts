export type ThemeTransitionPrepareOptions = {
  cx: number;
  cy: number;
  overlayColor?: string;
};

export type ThemeTransitionCommitOptions = {
  durationMs: number;
};

export const themeTransitionController = {
  isAvailable: false,
  async cancel() {},
  async commit(_options: ThemeTransitionCommitOptions) {},
  async prepare(_options: ThemeTransitionPrepareOptions) {},
};
