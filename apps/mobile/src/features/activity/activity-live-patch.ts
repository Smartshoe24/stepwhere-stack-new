import type {
  ActivitySteppedEventDto,
  ChildActivityResponseDto,
} from '@stepwhere/types';

import { ACTIVITY_GOALS, CALORIE_ESTIMATE } from './activity-constants';

/**
 * Applies a live step event to a cached activity response.
 *
 * The Activity screen advances today's numbers from realtime events rather than
 * refetching, so the step count moves within a minute of the child actually
 * walking. Everything here is derived from `stepsToday`, which is the server's
 * authoritative running total — we assign it rather than accumulating deltas
 * locally, so a dropped event self-corrects on the next one instead of leaving the
 * count permanently wrong.
 */
export function applySteppedEvent(
  response: ChildActivityResponseDto,
  event: ActivitySteppedEventDto,
): ChildActivityResponseDto {
  if (!response.isLive) {
    return response;
  }

  if (event.childId !== response.childId) {
    return response;
  }

  // The event belongs to a different local day than the range on screen.
  if (event.localDate < response.range.startDate || event.localDate > response.range.endDate) {
    return response;
  }

  const todayPoint = response.series.find((point) => point.date === event.localDate);

  if (!todayPoint) {
    return response;
  }

  const additionalSteps = event.stepsToday - todayPoint.steps;

  // Out-of-order or duplicate events must not move the number backwards.
  if (additionalSteps <= 0) {
    return response;
  }

  const additionalActiveMinutes = event.isActiveInterval
    ? event.activeSeconds / 60
    : 0;

  return {
    ...response,
    metrics: response.metrics.map((metric) => {
      if (metric.key === 'steps') {
        return withMetricValue(metric, metric.value + additionalSteps);
      }

      if (metric.key === 'calories') {
        return withMetricValue(metric, metric.value + estimateCalories(additionalSteps));
      }

      if (metric.key === 'activeTime' && additionalActiveMinutes > 0) {
        return withMetricValue(metric, Math.round(metric.value + additionalActiveMinutes));
      }

      return metric;
    }),
    series: response.series.map((point) => (
      point.date === event.localDate
        ? {
          ...point,
          steps: event.stepsToday,
          calories: estimateCalories(event.stepsToday),
          activeMinutes: Math.round(point.activeMinutes + additionalActiveMinutes),
        }
        : point
    )),
    rhythm: patchRhythm(response.rhythm, {
      hour: event.localHour,
      additionalSteps,
      additionalActiveMinutes,
    }),
  };
}

const CALORIES_PER_STEP =
  CALORIE_ESTIMATE.averageChildWeightKg * CALORIE_ESTIMATE.kcalPerKgPerStep;

function estimateCalories(steps: number) {
  return Math.round(steps * CALORIES_PER_STEP);
}

/**
 * Recomputes the derived display fields alongside the raw value, so a patched
 * metric card renders identically to a freshly fetched one.
 */
function withMetricValue(
  metric: ChildActivityResponseDto['metrics'][number],
  value: number,
): ChildActivityResponseDto['metrics'][number] {
  return {
    ...metric,
    value,
    formattedValue: formatMetricValue(metric.unit, value),
    percentOfGoal: metric.goalValue > 0
      ? Math.round((value / metric.goalValue) * 100)
      : 0,
  };
}

/** Mirrors the server's formatting so patched values do not look different. */
function formatMetricValue(
  unit: ChildActivityResponseDto['metrics'][number]['unit'],
  value: number,
) {
  if (unit === 'steps' || unit === 'kcal') {
    return Intl.NumberFormat('en-US').format(value);
  }

  const hours = Math.floor(value / 60);
  const minutes = value % 60;

  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

/**
 * Adds the interval to its hour bucket and re-elects the peak, so the rhythm chart
 * stays consistent with the metric cards even though it is not the live focus.
 */
function patchRhythm(
  rhythm: ChildActivityResponseDto['rhythm'],
  input: { hour: number; additionalSteps: number; additionalActiveMinutes: number },
) {
  const patched = rhythm.map((bucket) => (
    bucket.hour === input.hour
      ? {
        ...bucket,
        steps: bucket.steps + input.additionalSteps,
        activeMinutes: Math.round(bucket.activeMinutes + input.additionalActiveMinutes),
      }
      : bucket
  ));
  const peakSteps = Math.max(...patched.map((bucket) => bucket.steps), 0);

  if (peakSteps <= 0) {
    return patched.map((bucket) => ({ ...bucket, isPeak: false }));
  }

  const peakHour = patched.find((bucket) => bucket.steps === peakSteps)?.hour ?? null;

  return patched.map((bucket) => ({
    ...bucket,
    isPeak: peakHour !== null && bucket.hour === peakHour,
  }));
}

/** Exposed for the empty-state check: a child with a tracker but no movement yet. */
export function hasRecordedActivity(response: ChildActivityResponseDto) {
  return (
    response.series.some((point) => point.steps > 0 || point.activeMinutes > 0)
    || response.rhythm.some((bucket) => bucket.steps > 0)
  );
}

export const ACTIVITY_DAILY_STEP_GOAL = ACTIVITY_GOALS.stepsPerDay;
