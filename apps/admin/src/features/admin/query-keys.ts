import type {
  AdminActivityQuery,
  AdminChildrenListQuery,
  AdminDevicesListQuery,
  AdminFamiliesListQuery,
  AdminGeofenceBreachesListQuery,
  AdminGeofenceEventsListQuery,
  AdminGeofencesListQuery,
  AdminLocationEventsListQuery,
  AdminUsersListQuery,
  QaUnitsListQuery,
} from '@stepwhere/types'

export const adminQueryKeys = {
  qa: {
    all: () => ['admin', 'qa'] as const,
    stations: () => ['admin', 'qa', 'stations'] as const,
    jobs: (stationId: string) => ['admin', 'qa', 'jobs', stationId] as const,
    jobLog: (jobId: string) => ['admin', 'qa', 'job-log', jobId] as const,
    firmwareUploads: () => ['admin', 'qa', 'firmware-uploads'] as const,
    serialBuffer: (stationId: string, path: string) =>
      ['admin', 'qa', 'serial-buffer', stationId, path] as const,
    overview: () => ['admin', 'qa', 'overview'] as const,
    units: () => ['admin', 'qa', 'units'] as const,
    unitList: (query: QaUnitsListQuery) =>
      ['admin', 'qa', 'units', 'list', query] as const,
    unit: (unitId: string) => ['admin', 'qa', 'units', 'detail', unitId] as const,
    stationUnit: (stationId: string) =>
      ['admin', 'qa', 'station-unit', stationId] as const,
    stationTestRun: (stationId: string) =>
      ['admin', 'qa', 'station-test-run', stationId] as const,
    stationSlots: (stationId: string) =>
      ['admin', 'qa', 'station-slots', stationId] as const,
  },
  previewAccess: {
    state: () => ['admin', 'preview-access'] as const,
  },
  users: {
    list: (query: AdminUsersListQuery) => ['admin', 'users', 'list', query] as const,
    detail: (userId: string) => ['admin', 'users', 'detail', userId] as const,
  },
  children: {
    list: (query: AdminChildrenListQuery) =>
      ['admin', 'children', 'list', query] as const,
    detail: (childId: string) => ['admin', 'children', 'detail', childId] as const,
  },
  devices: {
    list: (query: AdminDevicesListQuery) =>
      ['admin', 'devices', 'list', query] as const,
    detail: (deviceId: string) => ['admin', 'devices', 'detail', deviceId] as const,
  },
  families: {
    list: (query: AdminFamiliesListQuery) =>
      ['admin', 'families', 'list', query] as const,
    detail: (familyId: string) => ['admin', 'families', 'detail', familyId] as const,
  },
  geofences: {
    list: (query: AdminGeofencesListQuery) =>
      ['admin', 'geofences', 'list', query] as const,
    detail: (geofenceId: string) =>
      ['admin', 'geofences', 'detail', geofenceId] as const,
    events: (geofenceId: string, query: AdminGeofenceEventsListQuery) =>
      ['admin', 'geofences', 'events', geofenceId, query] as const,
    breachCounts: () => ['admin', 'geofences', 'breach-counts'] as const,
  },
  breaches: {
    list: (query: AdminGeofenceBreachesListQuery) =>
      ['admin', 'geofence-breaches', 'list', query] as const,
  },
  telemetry: {
    childLocationEvents: (childId: string, query: AdminLocationEventsListQuery) =>
      ['admin', 'telemetry', 'children', childId, 'location-events', query] as const,
    childTrail: (
      childId: string,
      query: { distanceMeters?: number; geometry?: 'filtered' | 'roads' }
    ) => ['admin', 'telemetry', 'children', childId, 'trail', query] as const,
    childActivity: (childId: string, query: AdminActivityQuery) =>
      ['admin', 'telemetry', 'children', childId, 'activity', query] as const,
    deviceLive: (deviceId: string) =>
      ['admin', 'telemetry', 'devices', deviceId, 'live'] as const,
    deviceLocationEvents: (deviceId: string, query: AdminLocationEventsListQuery) =>
      ['admin', 'telemetry', 'devices', deviceId, 'location-events', query] as const,
  },
}
