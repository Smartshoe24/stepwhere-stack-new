/**
 * Mirrors of the server's activity constants.
 *
 * The server owns these — it computes every value the Activity screen displays.
 * They exist here only so live realtime patches can recompute derived numbers
 * (calories, percent-of-goal) between fetches using the same arithmetic. If these
 * ever diverge from `apps/server/src/modules/activity/activity.constants.ts`,
 * patched values will disagree with fetched ones.
 */
export const ACTIVITY_GOALS = {
  stepsPerDay: 8_000,
  activeMinutesPerDay: 120,
} as const;

export const CALORIE_ESTIMATE = {
  averageChildWeightKg: 30,
  kcalPerKgPerStep: 0.001,
} as const;

export const ACTIVITY_UI = {
  ringSize: 104,
  ringStrokeWidth: 10,
  rhythmChartHeight: 160,
} as const;
