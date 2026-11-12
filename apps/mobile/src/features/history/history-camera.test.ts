import type {
  ChildHistoryGapEventDto,
  ChildHistoryStayEventDto,
  ChildHistoryTripEventDto,
} from '@stepwhere/types';

import { describe, expect, it } from 'vitest';

import { getCameraPadding, getDayCoordinates, getEventCoordinates } from './history-camera';

const base = {
  status: 'finalized' as const,
  startedAt: '2026-07-25T08:00:00.000Z',
  endedAt: '2026-07-25T09:00:00.000Z',
  displayStartedAt: '2026-07-25T08:00:00.000Z',
  displayEndedAt: '2026-07-25T09:00:00.000Z',
  clippedDurationSeconds: 3600,
  continuesFromPreviousDay: false,
  continuesIntoNextDay: false,
  geofenceEvents: [],
};

const stay: ChildHistoryStayEventDto = {
  ...base,
  id: 'stay-1',
  kind: 'stay',
  radiusMeters: 35,
  place: {
    label: 'School',
    address: null,
    representativeCoordinate: { latitude: 28.61, longitude: 77.2 },
    providerPlaceId: null,
    matchType: 'saved',
    matchDistanceMeters: 4,
    enrichmentStatus: 'completed',
  },
};
const trip: ChildHistoryTripEventDto = {
  ...base,
  id: 'trip-1',
  kind: 'trip',
  originLabel: 'School',
  destinationLabel: 'Park',
  mode: 'walking',
  modeConfidence: 'high',
  distanceMeters: 1200,
  geometry: {
    source: 'filtered',
    segments: [[
      { latitude: 28.61, longitude: 77.2 },
      { latitude: 28.62, longitude: 77.21 },
    ]],
  },
};
const gap: ChildHistoryGapEventDto = {
  ...base,
  id: 'gap-1',
  kind: 'gap',
  reason: 'offline',
  beforeCoordinate: { latitude: 28.62, longitude: 77.21 },
  afterCoordinate: { latitude: 28.63, longitude: 77.22 },
};

describe('History camera data', () => {
  it('returns the correct coordinates for stays, trips, and gaps', () => {
    expect(getEventCoordinates(stay)).toHaveLength(1);
    expect(getEventCoordinates(trip)).toHaveLength(2);
    expect(getEventCoordinates(gap)).toHaveLength(2);
    expect(getDayCoordinates([stay, trip, gap])).toHaveLength(5);
  });

  it('accounts for the currently visible sheet in map padding', () => {
    expect(getCameraPadding(148).bottom).toBe(172);
    expect(getCameraPadding(40).bottom).toBe(96);
  });
});
