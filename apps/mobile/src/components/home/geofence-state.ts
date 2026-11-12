import type { ChildGeofenceDto } from '@stepwhere/types';

export type GeofenceUiStatus = 'unset' | 'editing' | 'enabled' | 'disabled' | 'breached';
export type GeofenceRadiusUnit = 'm' | 'km';

export type ChildGeofenceState = {
  breachedAt: string | null;
  centerLatitude: number | null;
  centerLongitude: number | null;
  containmentState: ChildGeofenceDto['containmentState'];
  editOriginStatus: Exclude<GeofenceUiStatus, 'editing'> | null;
  lastDistanceMeters: number | null;
  lastEvaluatedAt: string | null;
  radiusMeters: number;
  radiusUnit: GeofenceRadiusUnit;
  savedRadiusMeters: number | null;
  status: GeofenceUiStatus;
};

export const DEFAULT_GEOFENCE_RADIUS_METERS = 100;
export const MIN_GEOFENCE_RADIUS_METERS = 0;
export const MAX_GEOFENCE_RADIUS_METERS = 10000;
export const GEOFENCE_RADIUS_STEP_METERS = 50;

export const GEOFENCE_RADIUS_LIMITS = {
  km: {
    maxLabel: '10 km',
    maxMeters: 10000,
    minLabel: '0 km',
    minMeters: 0,
    stepMeters: 500,
  },
  m: {
    maxLabel: '1000 m',
    maxMeters: 1000,
    minLabel: '0 m',
    minMeters: 0,
    stepMeters: 50,
  },
} as const;

export function createDefaultGeofenceState(): ChildGeofenceState {
  return {
    breachedAt: null,
    centerLatitude: null,
    centerLongitude: null,
    containmentState: 'unknown',
    editOriginStatus: null,
    lastDistanceMeters: null,
    lastEvaluatedAt: null,
    radiusMeters: DEFAULT_GEOFENCE_RADIUS_METERS,
    radiusUnit: 'm',
    savedRadiusMeters: null,
    status: 'unset',
  };
}

export function toGeofenceState(geofence: ChildGeofenceDto): ChildGeofenceState {
  if (geofence.status === 'unset') {
    return createDefaultGeofenceState();
  }

  const savedRadiusMeters = geofence.radiusMeters ?? DEFAULT_GEOFENCE_RADIUS_METERS;

  return {
    breachedAt: geofence.breachedAt,
    centerLatitude: geofence.centerLatitude,
    centerLongitude: geofence.centerLongitude,
    containmentState: geofence.containmentState,
    editOriginStatus: null,
    lastDistanceMeters: geofence.lastDistanceMeters,
    lastEvaluatedAt: geofence.lastEvaluatedAt,
    radiusMeters: savedRadiusMeters,
    radiusUnit: savedRadiusMeters >= 1000 ? 'km' : 'm',
    savedRadiusMeters,
    status: geofence.status === 'enabled' && geofence.containmentState === 'outside'
      ? 'breached'
      : geofence.status,
  };
}

export function clampGeofenceRadius(radiusMeters: number, unit: GeofenceRadiusUnit = 'm') {
  const limits = GEOFENCE_RADIUS_LIMITS[unit];
  const stepped = Math.round(radiusMeters / limits.stepMeters) * limits.stepMeters;
  return Math.min(Math.max(stepped, limits.minMeters), limits.maxMeters);
}

export function formatGeofenceRadius(radiusMeters: number) {
  return formatGeofenceRadiusForUnit(radiusMeters, 'm');
}

export function formatGeofenceRadiusForUnit(radiusMeters: number, unit: GeofenceRadiusUnit) {
  if (unit === 'km') {
    const km = radiusMeters / 1000;
    return `${Number.isInteger(km) ? km.toFixed(0) : km.toFixed(1)} km`;
  }

  return `${radiusMeters} m`;
}
