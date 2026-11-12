import type { ChildHistoryEventDto } from '@stepwhere/types';

import { describe, expect, it } from 'vitest';

import { buildHistoryDaySummary, findSegmentEventId, getElapsedRatio } from './history-day-summary';

const DATE = '2026-07-25';

function makeStay(input: {
  id: string;
  startHour: number;
  endHour: number;
  label?: string;
  placeId?: string | null;
}): ChildHistoryEventDto {
  return {
    id: input.id,
    kind: 'stay',
    status: 'finalized',
    startedAt: isoAt(input.startHour),
    endedAt: isoAt(input.endHour),
    displayStartedAt: isoAt(input.startHour),
    displayEndedAt: isoAt(input.endHour),
    clippedDurationSeconds: (input.endHour - input.startHour) * 3600,
    continuesFromPreviousDay: false,
    continuesIntoNextDay: false,
    geofenceEvents: [],
    radiusMeters: 60,
    place: {
      label: input.label ?? 'Home',
      address: null,
      representativeCoordinate: { latitude: 1, longitude: 2 },
      providerPlaceId: input.placeId === undefined ? input.label ?? 'Home' : input.placeId,
      matchType: 'saved',
      matchDistanceMeters: null,
      enrichmentStatus: 'completed',
    },
  };
}

function makeTrip(input: {
  id: string;
  startHour: number;
  endHour: number;
  distanceMeters: number;
}): ChildHistoryEventDto {
  return {
    id: input.id,
    kind: 'trip',
    status: 'finalized',
    startedAt: isoAt(input.startHour),
    endedAt: isoAt(input.endHour),
    displayStartedAt: isoAt(input.startHour),
    displayEndedAt: isoAt(input.endHour),
    clippedDurationSeconds: (input.endHour - input.startHour) * 3600,
    continuesFromPreviousDay: false,
    continuesIntoNextDay: false,
    geofenceEvents: [],
    originLabel: 'Home',
    destinationLabel: 'School',
    mode: 'walking',
    modeConfidence: 'high',
    distanceMeters: input.distanceMeters,
    geometry: { source: 'filtered', segments: [] },
  };
}

function makeGap(input: { id: string; startHour: number; endHour: number }): ChildHistoryEventDto {
  return {
    id: input.id,
    kind: 'gap',
    status: 'finalized',
    startedAt: isoAt(input.startHour),
    endedAt: isoAt(input.endHour),
    displayStartedAt: isoAt(input.startHour),
    displayEndedAt: isoAt(input.endHour),
    clippedDurationSeconds: (input.endHour - input.startHour) * 3600,
    continuesFromPreviousDay: false,
    continuesIntoNextDay: false,
    geofenceEvents: [],
    reason: 'telemetry_gap',
    beforeCoordinate: null,
    afterCoordinate: null,
  };
}

function isoAt(hour: number) {
  const whole = Math.floor(hour);
  const minutes = Math.round((hour - whole) * 60);

  return `${DATE}T${String(whole).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00.000Z`;
}

describe('buildHistoryDaySummary', () => {
  it('counts distinct places rather than stay events', () => {
    const summary = buildHistoryDaySummary({
      dateKey: DATE,
      events: [
        makeStay({ id: 'a', startHour: 0, endHour: 8, label: 'Home' }),
        makeStay({ id: 'b', startHour: 9, endHour: 15, label: 'School' }),
        makeStay({ id: 'c', startHour: 16, endHour: 22, label: 'Home' }),
      ],
    });

    expect(summary.placeCount).toBe(2);
  });

  it('sums trip distance and separates tracked from gap time', () => {
    const summary = buildHistoryDaySummary({
      dateKey: DATE,
      events: [
        makeStay({ id: 'a', startHour: 0, endHour: 8 }),
        makeTrip({ id: 'b', startHour: 8, endHour: 9, distanceMeters: 1200 }),
        makeGap({ id: 'c', startHour: 9, endHour: 11 }),
        makeTrip({ id: 'd', startHour: 11, endHour: 12, distanceMeters: 800 }),
      ],
    });

    expect(summary.distanceMeters).toBe(2000);
    expect(summary.trackedSeconds).toBe(10 * 3600);
    expect(summary.gapSeconds).toBe(2 * 3600);
    expect(summary.coverageRatio).toBeCloseTo(10 / 12, 5);
  });

  it('lays segments out against real elapsed time', () => {
    const summary = buildHistoryDaySummary({
      dateKey: DATE,
      events: [makeStay({ id: 'a', startHour: 6, endHour: 12 })],
    });
    const stay = summary.segments.find(segment => segment.eventId === 'a');

    expect(stay?.start).toBeCloseTo(0.25, 5);
    expect(stay?.span).toBeCloseTo(0.25, 5);
  });

  it('inserts untracked runs before, between, and after events', () => {
    const summary = buildHistoryDaySummary({
      dateKey: DATE,
      events: [
        makeStay({ id: 'a', startHour: 2, endHour: 4 }),
        makeStay({ id: 'b', startHour: 10, endHour: 12, label: 'School' }),
      ],
    });

    expect(summary.segments.map(segment => segment.kind)).toEqual([
      'untracked',
      'stay',
      'untracked',
      'stay',
      'untracked',
    ]);
  });

  it('stops the untracked fill at the current time for a partially elapsed day', () => {
    const summary = buildHistoryDaySummary({
      dateKey: DATE,
      events: [makeStay({ id: 'a', startHour: 0, endHour: 6 })],
      now: new Date(`${DATE}T12:00:00.000Z`),
    });
    const trailing = summary.segments[summary.segments.length - 1]!;

    expect(trailing.kind).toBe('untracked');
    expect(trailing.start + trailing.span).toBeCloseTo(0.5, 5);
  });

  it('derives an end for ongoing events from the clipped duration', () => {
    const ongoing = makeStay({ id: 'a', startHour: 6, endHour: 6 });
    const summary = buildHistoryDaySummary({
      dateKey: DATE,
      events: [{
        ...ongoing,
        status: 'ongoing',
        endedAt: null,
        displayEndedAt: null,
        clippedDurationSeconds: 2 * 3600,
      }],
    });
    const stay = summary.segments.find(segment => segment.eventId === 'a');

    expect(stay?.span).toBeCloseTo(2 / 24, 5);
  });

  it('absorbs sub-pixel segments instead of rendering hairlines', () => {
    const summary = buildHistoryDaySummary({
      dateKey: DATE,
      events: [
        makeStay({ id: 'a', startHour: 0, endHour: 6 }),
        makeTrip({ id: 'tiny', startHour: 6, endHour: 6.01, distanceMeters: 40 }),
        makeStay({ id: 'b', startHour: 6.01, endHour: 12, label: 'School' }),
      ],
    });

    expect(summary.segments.some(segment => segment.eventId === 'tiny')).toBe(false);
    expect(summary.segments.filter(segment => segment.kind === 'untracked')).toHaveLength(1);
  });
});

describe('getElapsedRatio', () => {
  it('treats a past day as fully elapsed', () => {
    expect(getElapsedRatio(DATE, null)).toBe(1);
  });

  it('stops at the current clock time for today', () => {
    expect(getElapsedRatio(DATE, new Date(`${DATE}T18:00:00.000Z`))).toBeCloseTo(0.75, 5);
  });
});

describe('findSegmentEventId', () => {
  const segments = buildHistoryDaySummary({
    dateKey: DATE,
    events: [
      makeStay({ id: 'a', startHour: 0, endHour: 6 }),
      makeStay({ id: 'b', startHour: 12, endHour: 18, label: 'School' }),
    ],
  }).segments;

  it('resolves a position inside a segment to its event', () => {
    expect(findSegmentEventId(segments, 0.1)).toBe('a');
    expect(findSegmentEventId(segments, 0.6)).toBe('b');
  });

  it('falls back to the nearest event when the position lands on untracked time', () => {
    expect(findSegmentEventId(segments, 0.35)).toBe('a');
    expect(findSegmentEventId(segments, 0.95)).toBe('b');
  });
});
