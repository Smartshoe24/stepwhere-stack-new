import type {
  ChildHistoryEventDto,
  ChildHistoryTripEventDto,
  HistoryCoordinateDto,
} from '@stepwhere/types';
import type { EdgePadding, Region } from 'react-native-maps';

export const DEFAULT_HISTORY_REGION: Region = {
  latitude: 28.6139,
  longitude: 77.209,
  latitudeDelta: 0.04,
  longitudeDelta: 0.04,
};

/**
 * A trip is shown on the map by where it started and ended, never by the path
 * in between: the recorded path cuts through buildings and is not reliable
 * enough to draw.
 */
export function getTripEndpoints(
  event: ChildHistoryTripEventDto,
): { start: HistoryCoordinateDto; end: HistoryCoordinateDto } | null {
  const points = event.geometry.segments.flat();
  const first = points[0];
  const last = points[points.length - 1];

  if (!first || !last) {
    return null;
  }

  return {
    start: { latitude: first.latitude, longitude: first.longitude },
    end: { latitude: last.latitude, longitude: last.longitude },
  };
}

export function getEventCoordinates(event: ChildHistoryEventDto): HistoryCoordinateDto[] {
  if (event.kind === 'stay') {
    return event.place.representativeCoordinate ? [event.place.representativeCoordinate] : [];
  }

  if (event.kind === 'trip') {
    const endpoints = getTripEndpoints(event);

    return endpoints ? [endpoints.start, endpoints.end] : [];
  }

  return [event.beforeCoordinate, event.afterCoordinate].filter(Boolean) as HistoryCoordinateDto[];
}

export function getDayCoordinates(events: ChildHistoryEventDto[]) {
  return events.flatMap(getEventCoordinates);
}

export function getInitialRegion(events: ChildHistoryEventDto[]): Region {
  const coordinates = getDayCoordinates(events);

  if (coordinates.length === 0) {
    return DEFAULT_HISTORY_REGION;
  }

  const bounds = getBounds(coordinates);

  return {
    latitude: (bounds.minLatitude + bounds.maxLatitude) / 2,
    longitude: (bounds.minLongitude + bounds.maxLongitude) / 2,
    latitudeDelta: Math.max(0.01, (bounds.maxLatitude - bounds.minLatitude) * 1.8),
    longitudeDelta: Math.max(0.01, (bounds.maxLongitude - bounds.minLongitude) * 1.8),
  };
}

export function getCameraPadding(bottomOverlayHeight: number): EdgePadding {
  return {
    top: 42,
    right: 42,
    bottom: Math.max(96, Math.round(bottomOverlayHeight + 24)),
    left: 42,
  };
}

function getBounds(coordinates: HistoryCoordinateDto[]) {
  return coordinates.reduce((bounds, coordinate) => ({
    minLatitude: Math.min(bounds.minLatitude, coordinate.latitude),
    maxLatitude: Math.max(bounds.maxLatitude, coordinate.latitude),
    minLongitude: Math.min(bounds.minLongitude, coordinate.longitude),
    maxLongitude: Math.max(bounds.maxLongitude, coordinate.longitude),
  }), {
    minLatitude: coordinates[0]!.latitude,
    maxLatitude: coordinates[0]!.latitude,
    minLongitude: coordinates[0]!.longitude,
    maxLongitude: coordinates[0]!.longitude,
  });
}
