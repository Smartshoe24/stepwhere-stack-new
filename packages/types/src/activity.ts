export type ActivityPeriod = "day" | "week" | "month" | "year";

export type ActivityMetricKey = "steps" | "activeTime" | "calories";

export type ActivityRangeDto = {
  startDate: string;
  endDate: string;
  timezone: string;
  label: string;
};

export type ActivityInsightPointDto = {
  id: string;
  label: string;
  value: string;
  tone: "green" | "blue" | "yellow";
};

export type ActivityInsightBannerDto = {
  mode: "active" | "inactive";
  title: string;
  points: [ActivityInsightPointDto, ActivityInsightPointDto];
};

export type ActivityMetricDto = {
  key: ActivityMetricKey;
  label: string;
  value: number;
  formattedValue: string;
  unit: "steps" | "min" | "kcal";
  goalValue: number;
  formattedGoal: string;
  percentOfGoal: number;
  comparisonPercent: number | null;
  tone: "green" | "blue" | "orange";
};

export type ActivityHourlyBucketDto = {
  hour: number;
  label: string;
  steps: number;
  activeMinutes: number;
  isPeak: boolean;
};

export type ActivitySeriesPointDto = {
  date: string;
  label: string;
  steps: number;
  activeMinutes: number;
  calories: number;
};

export type ChildActivityResponseDto = {
  childId: string;
  period: ActivityPeriod;
  range: ActivityRangeDto;
  generatedAt: string;
  insightBanner: ActivityInsightBannerDto;
  metrics: ActivityMetricDto[];
  rhythm: ActivityHourlyBucketDto[];
  series: ActivitySeriesPointDto[];
  /**
   * True when the range covers the child's current local day, so the client may
   * apply live `activity.stepped` patches to these numbers. False for historical
   * ranges, which never change.
   */
  isLive: boolean;
};

/**
 * Incremental step event broadcast on every telemetry ingest.
 *
 * Lets the Activity screen advance today's totals between fetches instead of
 * waiting for a refetch. `stepsToday` is the server's authoritative running total,
 * so the client can assign it rather than accumulating deltas itself — that keeps a
 * missed event from causing permanent drift.
 */
export type ActivitySteppedEventDto = {
  childId: string;
  /** Steps in this single interval. */
  stepDelta: number;
  /** Authoritative running total for the child's local day. */
  stepsToday: number;
  /** Local date `stepsToday` belongs to, `YYYY-MM-DD`. */
  localDate: string;
  /** Timezone that local date was computed in. */
  timezone: string;
  /** Local hour 0-23 the interval ended in, for rhythm bucketing. */
  localHour: number;
  /** Whether the interval met the active-movement threshold. */
  isActiveInterval: boolean;
  /** Active seconds credited by this interval. */
  activeSeconds: number;
  occurredAt: string;
};
