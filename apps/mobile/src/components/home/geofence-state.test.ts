import { describe, expect, it } from 'vitest';

import {
  clampGeofenceRadius,
  formatGeofenceRadius,
  formatGeofenceRadiusForUnit,
  GEOFENCE_RADIUS_LIMITS,
} from './geofence-state';

describe('clampGeofenceRadius', () => {
  it('snaps to the step for the active unit', () => {
    expect(clampGeofenceRadius(123, 'm')).toBe(100);
    expect(clampGeofenceRadius(126, 'm')).toBe(150);
    expect(clampGeofenceRadius(1200, 'km')).toBe(1000);
    expect(clampGeofenceRadius(1300, 'km')).toBe(1500);
  });

  it('clamps to each unit range', () => {
    expect(clampGeofenceRadius(-50, 'm')).toBe(0);
    expect(clampGeofenceRadius(5000, 'm')).toBe(GEOFENCE_RADIUS_LIMITS.m.maxMeters);
    expect(clampGeofenceRadius(50_000, 'km')).toBe(GEOFENCE_RADIUS_LIMITS.km.maxMeters);
  });

  it('is idempotent, so the drag equality guard can rely on it', () => {
    for (const value of [0, 50, 350, 1000]) {
      expect(clampGeofenceRadius(clampGeofenceRadius(value, 'm'), 'm'))
        .toBe(clampGeofenceRadius(value, 'm'));
    }
  });

  it('defaults to meters', () => {
    expect(clampGeofenceRadius(123)).toBe(clampGeofenceRadius(123, 'm'));
  });
});

describe('formatGeofenceRadiusForUnit', () => {
  it('renders meters as whole numbers', () => {
    expect(formatGeofenceRadiusForUnit(0, 'm')).toBe('0 m');
    expect(formatGeofenceRadiusForUnit(250, 'm')).toBe('250 m');
  });

  it('drops the decimal on whole kilometres and keeps one otherwise', () => {
    expect(formatGeofenceRadiusForUnit(1000, 'km')).toBe('1 km');
    expect(formatGeofenceRadiusForUnit(1500, 'km')).toBe('1.5 km');
    expect(formatGeofenceRadiusForUnit(10_000, 'km')).toBe('10 km');
  });

  it('produces a distinct label for every step, so the badge dedupes cleanly', () => {
    for (const unit of ['m', 'km'] as const) {
      const limits = GEOFENCE_RADIUS_LIMITS[unit];
      const labels = new Set<string>();

      for (let value = limits.minMeters; value <= limits.maxMeters; value += limits.stepMeters) {
        labels.add(formatGeofenceRadiusForUnit(value, unit));
      }

      const stepCount = (limits.maxMeters - limits.minMeters) / limits.stepMeters + 1;
      expect(labels.size).toBe(stepCount);
    }
  });

  it('formatGeofenceRadius is the meters shorthand', () => {
    expect(formatGeofenceRadius(400)).toBe('400 m');
  });
});
