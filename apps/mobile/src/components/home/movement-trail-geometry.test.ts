import type { ChildTrailResponseDto } from '@stepwhere/types';

import { describe, expect, it } from 'vitest';

import { MAX_TRAIL_DOTS, prepareMovementTrailDots } from './movement-trail-geometry';

const START_MS = Date.parse('2026-07-25T10:00:00.000Z');
/** Roughly 1m of latitude, so distances are easy to reason about. */
const METER_IN_DEGREES = 1 / 111_320;

/**
 * Builds a straight north-bound trail of the requested ground length, sampled
 * every 10m so the dot spacing logic has points to interpolate between. Points
 * run oldest-first, so the final point is "latest".
 */
function buildStraightTrail(lengthMeters: number): ChildTrailResponseDto {
  const sampleSpacingMeters = 10;
  const sampleCount = Math.floor(lengthMeters / sampleSpacingMeters) + 1;
  const points = Array.from({ length: sampleCount }, (_, index) => ({
    latitude: index * sampleSpacingMeters * METER_IN_DEGREES,
    longitude: 0,
    occurredAt: new Date(START_MS + index * 1000).toISOString(),
    distanceFromLatestMeters: (sampleCount - 1 - index) * sampleSpacingMeters,
  }));

  return {
    childId: 'child-1',
    distanceMeters: lengthMeters,
    generatedAt: new Date(START_MS + sampleCount * 1000).toISOString(),
    geometrySource: 'filtered',
    points,
    segments: [{ source: 'filtered', points }],
  };
}

describe('prepareMovementTrailDots dot budget', () => {
  it('uses the default 40m spacing on a short trail', () => {
    const dots = prepareMovementTrailDots(buildStraightTrail(400));

    // ~400m at 40m spacing, so nowhere near the cap.
    expect(dots.length).toBeLessThanOrEqual(12);
    expect(dots.length).toBeGreaterThan(4);
  });

  it('never exceeds the dot cap on a long trail', () => {
    // At a fixed 40m spacing this would emit ~500 native map circles.
    const dots = prepareMovementTrailDots(buildStraightTrail(20_000));

    expect(dots.length).toBeLessThanOrEqual(MAX_TRAIL_DOTS + 1);
  });

  it('widens spacing proportionally rather than truncating the trail', () => {
    const dots = prepareMovementTrailDots(buildStraightTrail(20_000));
    const furthest = dots[0]!;
    const nearest = dots[dots.length - 1]!;

    // The full span is still covered; only the sampling density changed.
    expect(furthest.distanceFromLatestMeters).toBeGreaterThan(19_000);
    expect(nearest.distanceFromLatestMeters).toBeLessThan(500);
  });

  it('returns dots ordered furthest-first so older dots draw underneath', () => {
    const dots = prepareMovementTrailDots(buildStraightTrail(2_000));
    const distances = dots.map(dot => dot.distanceFromLatestMeters);

    expect(distances).toEqual([...distances].sort((left, right) => right - left));
  });

  it('returns nothing for an empty trail', () => {
    expect(prepareMovementTrailDots(null)).toEqual([]);
    expect(prepareMovementTrailDots(buildStraightTrail(0))).toEqual([]);
  });
});
