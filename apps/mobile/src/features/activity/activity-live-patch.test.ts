import type {
  ActivitySteppedEventDto,
  ChildActivityResponseDto,
} from '@stepwhere/types';

import { describe, expect, it } from 'vitest';

import { applySteppedEvent, hasRecordedActivity } from './activity-live-patch';

const TODAY = '2026-01-02';

function buildResponse(overrides?: Partial<ChildActivityResponseDto>): ChildActivityResponseDto {
  return {
    childId: 'child-1',
    period: 'day',
    range: { startDate: TODAY, endDate: TODAY, timezone: 'Asia/Kolkata', label: 'Today' },
    generatedAt: '2026-01-02T06:00:00.000Z',
    isLive: true,
    insightBanner: {
      mode: 'active',
      title: 'Active day',
      points: [
        { id: 'more-active', label: 'More active', value: '+5%', tone: 'green' },
        { id: 'most-active-location', label: 'Where', value: 'School', tone: 'blue' },
      ],
    },
    metrics: [
      {
        key: 'steps',
        label: 'Steps',
        value: 1_000,
        formattedValue: '1,000',
        unit: 'steps',
        goalValue: 8_000,
        formattedGoal: 'Goal: 8,000',
        percentOfGoal: 13,
        comparisonPercent: 5,
        tone: 'green',
      },
      {
        key: 'activeTime',
        label: 'Active Time',
        value: 30,
        formattedValue: '30m',
        unit: 'min',
        goalValue: 120,
        formattedGoal: 'Goal: 2h',
        percentOfGoal: 25,
        comparisonPercent: 5,
        tone: 'blue',
      },
      {
        key: 'calories',
        label: 'Calories',
        value: 30,
        formattedValue: '30',
        unit: 'kcal',
        goalValue: 240,
        formattedGoal: 'Goal: 240 kcal',
        percentOfGoal: 13,
        comparisonPercent: 5,
        tone: 'orange',
      },
    ],
    rhythm: Array.from({ length: 24 }, (_, hour) => ({
      hour,
      label: `${hour}`,
      steps: hour === 9 ? 1_000 : 0,
      activeMinutes: hour === 9 ? 30 : 0,
      isPeak: hour === 9,
    })),
    series: [{ date: TODAY, label: '2 Jan', steps: 1_000, activeMinutes: 30, calories: 30 }],
    ...overrides,
  };
}

function buildEvent(overrides?: Partial<ActivitySteppedEventDto>): ActivitySteppedEventDto {
  return {
    childId: 'child-1',
    stepDelta: 200,
    stepsToday: 1_200,
    localDate: TODAY,
    timezone: 'Asia/Kolkata',
    localHour: 10,
    isActiveInterval: true,
    activeSeconds: 120,
    occurredAt: '2026-01-02T06:05:00.000Z',
    ...overrides,
  };
}

describe('applySteppedEvent', () => {
  it('advances steps to the authoritative running total', () => {
    const next = applySteppedEvent(buildResponse(), buildEvent());
    const steps = next.metrics.find((metric) => metric.key === 'steps')!;

    expect(steps.value).toBe(1_200);
    expect(steps.formattedValue).toBe('1,200');
    expect(next.series[0]!.steps).toBe(1_200);
  });

  it('recomputes percent of goal alongside the raw value', () => {
    const next = applySteppedEvent(buildResponse(), buildEvent({ stepsToday: 4_000 }));
    const steps = next.metrics.find((metric) => metric.key === 'steps')!;

    expect(steps.value).toBe(4_000);
    expect(steps.percentOfGoal).toBe(50);
  });

  it('scales calories with the added steps', () => {
    const next = applySteppedEvent(buildResponse(), buildEvent());
    const calories = next.metrics.find((metric) => metric.key === 'calories')!;

    // 200 extra steps * 0.03 kcal = 6.
    expect(calories.value).toBe(36);
    expect(next.series[0]!.calories).toBe(36);
  });

  it('adds active minutes only for active intervals', () => {
    const active = applySteppedEvent(buildResponse(), buildEvent());
    const inactive = applySteppedEvent(
      buildResponse(),
      buildEvent({ isActiveInterval: false, activeSeconds: 0 }),
    );

    expect(active.metrics.find((metric) => metric.key === 'activeTime')!.value).toBe(32);
    expect(inactive.metrics.find((metric) => metric.key === 'activeTime')!.value).toBe(30);
  });

  it('is idempotent for a replayed event', () => {
    const event = buildEvent();
    const once = applySteppedEvent(buildResponse(), event);
    const twice = applySteppedEvent(once, event);

    expect(twice).toBe(once);
  });

  it('never moves the count backwards on an out-of-order event', () => {
    const response = buildResponse();
    const stale = applySteppedEvent(response, buildEvent({ stepsToday: 500 }));

    expect(stale).toBe(response);
  });

  it('self-heals after a dropped event by assigning the running total', () => {
    // Two events arrive but only the second is seen; the total is still correct.
    const next = applySteppedEvent(buildResponse(), buildEvent({ stepsToday: 1_900 }));

    expect(next.metrics.find((metric) => metric.key === 'steps')!.value).toBe(1_900);
  });

  it('patches the matching rhythm hour and re-elects the peak', () => {
    const next = applySteppedEvent(
      buildResponse(),
      buildEvent({ stepsToday: 3_000, localHour: 10 }),
    );

    expect(next.rhythm[10]!.steps).toBe(2_000);
    expect(next.rhythm[10]!.isPeak).toBe(true);
    expect(next.rhythm[9]!.isPeak).toBe(false);
  });

  it('ignores events for a non-live range', () => {
    const response = buildResponse({ isLive: false });

    expect(applySteppedEvent(response, buildEvent())).toBe(response);
  });

  it('ignores events for another child', () => {
    const response = buildResponse();

    expect(applySteppedEvent(response, buildEvent({ childId: 'child-2' }))).toBe(response);
  });

  it('ignores events outside the displayed range', () => {
    const response = buildResponse();

    expect(applySteppedEvent(response, buildEvent({ localDate: '2026-01-05' }))).toBe(response);
    expect(applySteppedEvent(response, buildEvent({ localDate: '2025-12-31' }))).toBe(response);
  });

  it('patches the right day inside a multi-day range', () => {
    const response = buildResponse({
      period: 'week',
      range: {
        startDate: '2026-01-01',
        endDate: '2026-01-07',
        timezone: 'Asia/Kolkata',
        label: '1 Jan - 7 Jan',
      },
      series: [
        { date: '2026-01-01', label: '1 Jan', steps: 500, activeMinutes: 10, calories: 15 },
        { date: TODAY, label: '2 Jan', steps: 1_000, activeMinutes: 30, calories: 30 },
      ],
    });
    const next = applySteppedEvent(response, buildEvent());

    expect(next.series[0]!.steps).toBe(500);
    expect(next.series[1]!.steps).toBe(1_200);
    expect(next.metrics.find((metric) => metric.key === 'steps')!.value).toBe(1_200);
  });
});

describe('hasRecordedActivity', () => {
  it('detects any recorded movement', () => {
    expect(hasRecordedActivity(buildResponse())).toBe(true);
  });

  it('reports a child with a tracker but no movement', () => {
    const empty = buildResponse({
      series: [{ date: TODAY, label: '2 Jan', steps: 0, activeMinutes: 0, calories: 0 }],
      rhythm: Array.from({ length: 24 }, (_, hour) => ({
        hour,
        label: `${hour}`,
        steps: 0,
        activeMinutes: 0,
        isPeak: false,
      })),
    });

    expect(hasRecordedActivity(empty)).toBe(false);
  });
});
