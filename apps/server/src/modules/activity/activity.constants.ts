export const ACTIVITY_STEP_RATE_THRESHOLD_PER_MINUTE = 50;
export const MAX_ACTIVE_INTERVAL_SECONDS = 300;
export const ACTIVITY_COUNTER_TTL_SECONDS = 8 * 24 * 60 * 60;

export const ACTIVITY_GOALS = {
  stepsPerDay: 8_000,
  activeMinutesPerDay: 120,
};

export const ACTIVITY_CLASSIFICATION = {
  activeGoalRatio: 0.75,
};

export const CALORIE_ESTIMATE = {
  averageChildWeightKg: 30,
  kcalPerKgPerStep: 0.001,
};

export const GEOCODING_CACHE = {
  coordinatePrecision: 4,
  ttlDays: 90,
};
