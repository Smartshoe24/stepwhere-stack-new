import { describe, expect, it } from 'vitest';

import {
  clampDateKey,
  formatDateLabel,
  formatGapReason,
  fromLocalDateKey,
  getTodayDateKey,
  shiftDateKey,
  splitEventTime,
  toLocalDateKey,
} from './history-formatters';

describe('History local date helpers', () => {
  it('uses the requested phone timezone instead of UTC for today', () => {
    const instant = new Date('2026-01-01T20:00:00.000Z');

    expect(getTodayDateKey(instant, 'Asia/Kolkata')).toBe('2026-01-02');
    expect(getTodayDateKey(instant, 'America/Los_Angeles')).toBe('2026-01-01');
  });

  it('round-trips a date picker value through local calendar fields', () => {
    const localDate = fromLocalDateKey('2026-07-25');

    expect(toLocalDateKey(localDate)).toBe('2026-07-25');
  });

  it('moves exactly one calendar day without skipping empty dates', () => {
    expect(shiftDateKey('2026-07-25', -1)).toBe('2026-07-24');
    expect(shiftDateKey('2026-07-25', 1)).toBe('2026-07-26');
  });

  it('clamps outside dates while retaining selectable empty dates inside the range', () => {
    expect(clampDateKey('2026-07-10', '2026-07-12', '2026-07-25')).toBe('2026-07-12');
    expect(clampDateKey('2026-07-18', '2026-07-12', '2026-07-25')).toBe('2026-07-18');
    expect(clampDateKey('2026-07-30', '2026-07-12', '2026-07-25')).toBe('2026-07-25');
  });
});

describe('History display formatting', () => {
  it('names today and yesterday instead of printing dates', () => {
    expect(formatDateLabel('2026-07-25', '2026-07-25')).toBe('Today');
    expect(formatDateLabel('2026-07-24', '2026-07-25')).toBe('Yesterday');
    expect(formatDateLabel('2026-07-20', '2026-07-25')).toBe('Mon, Jul 20');
  });

  it('splits the time so the period can be demoted in the gutter', () => {
    const parsed = splitEventTime('2026-07-25T09:41:00.000Z');

    expect(parsed.time).toMatch(/^\d{1,2}:\d{2}$/);
    expect(parsed.period).toMatch(/^(AM|PM)$/);
  });

  it('never leaks raw gap reason enums to the user', () => {
    expect(formatGapReason('telemetry_gap')).toBe('No signal');
    expect(formatGapReason('offline')).toBe('Device offline');
    expect(formatGapReason('moved_while_sleeping')).toBe('Moved while asleep');
  });
});
