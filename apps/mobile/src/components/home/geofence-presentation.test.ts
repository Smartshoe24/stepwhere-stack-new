import { describe, expect, it } from 'vitest';

import { getGeofenceRingColors } from './geofence-presentation';

const theme = {
  colors: {
    geofence: {
      breachedRingFill: 'rgba(220, 38, 38, 0.12)',
      breachedRingStroke: 'rgba(220, 38, 38, 0.72)',
      ringFill: 'rgba(255, 56, 187, 0.13)',
      ringStroke: 'rgba(255, 56, 187, 0.72)',
    },
  },
} as unknown as Parameters<typeof getGeofenceRingColors>[0];

describe('getGeofenceRingColors', () => {
  it('returns the normal enabled and breached ring colors unchanged', () => {
    expect(getGeofenceRingColors(theme, 'enabled')).toEqual({
      fill: 'rgba(255, 56, 187, 0.13)',
      stroke: 'rgba(255, 56, 187, 0.72)',
    });
    expect(getGeofenceRingColors(theme, 'breached')).toEqual({
      fill: 'rgba(220, 38, 38, 0.12)',
      stroke: 'rgba(220, 38, 38, 0.72)',
    });
  });

  it('dims both fill and stroke to forty percent while pending', () => {
    expect(getGeofenceRingColors(theme, 'enabled', true)).toEqual({
      fill: 'rgba(255, 56, 187, 0.052)',
      stroke: 'rgba(255, 56, 187, 0.288)',
    });
  });
});
