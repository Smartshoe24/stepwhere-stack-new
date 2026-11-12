import { describe, expect, it } from 'vitest';

import {
  getMetersPerPixel,
  getMetersPerPixelForRegion,
  getPreviewRadiusPx,
  getZoomFromLongitudeDelta,
  interpolateGeofenceRadius,
  projectCoordinateToScreen,
} from './geofence-preview-geometry';

describe('geofence preview geometry', () => {
  it('matches known Web Mercator resolution and zoom scaling', () => {
    expect(getMetersPerPixel(0, 0)).toBeCloseTo(156_543.03, 1);
    expect(getMetersPerPixel(0, 11) / getMetersPerPixel(0, 10)).toBeCloseTo(0.5, 6);
    expect(getZoomFromLongitudeDelta(0.02, 390)
      - getZoomFromLongitudeDelta(0.04, 390)).toBeCloseTo(1, 6);
  });

  it('derives a plausible resolution and degrades safely before layout', () => {
    expect(getMetersPerPixelForRegion({
      latitude: 28.6139,
      longitudeDelta: 0.04,
      widthPx: 390,
    })).toBeGreaterThan(5);
    expect(getMetersPerPixelForRegion({
      latitude: 28.6139,
      longitudeDelta: 0.04,
      widthPx: 0,
    })).toBe(0);
  });

  it('projects the center and viewport corners to screen coordinates', () => {
    const region = {
      latitude: 28,
      longitude: 77,
      latitudeDelta: 2,
      longitudeDelta: 4,
    };

    expect(projectCoordinateToScreen({
      heightPx: 800,
      latitude: 28,
      longitude: 77,
      region,
      widthPx: 400,
    })).toEqual({ x: 200, y: 400 });
    expect(projectCoordinateToScreen({
      heightPx: 800,
      latitude: 29,
      longitude: 75,
      region,
      widthPx: 400,
    })).toEqual({ x: 0, y: 0 });
  });

  it('keeps metre and kilometre radii linear without clamping', () => {
    expect(getPreviewRadiusPx({ radiusMeters: 100, metersPerPixel: 2 })).toBe(50);
    expect(getPreviewRadiusPx({ radiusMeters: 20_000, metersPerPixel: 1 })).toBe(20_000);
    expect(getPreviewRadiusPx({ radiusMeters: 100, metersPerPixel: 0 })).toBe(0);
  });

  it('interpolates expansion and contraction and clamps progress', () => {
    expect(interpolateGeofenceRadius(1_000, 5_000, 0.5)).toBe(3_000);
    expect(interpolateGeofenceRadius(5_000, 1_000, 0.25)).toBe(4_000);
    expect(interpolateGeofenceRadius(1_000, 5_000, -1)).toBe(1_000);
    expect(interpolateGeofenceRadius(1_000, 5_000, 2)).toBe(5_000);
  });
});
