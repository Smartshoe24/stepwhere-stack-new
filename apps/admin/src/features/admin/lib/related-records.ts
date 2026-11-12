import { queryOptions, type FetchQueryOptions, type QueryClient } from '@tanstack/react-query'
import type { AdminRelatedRecordType } from '@stepwhere/types'
import {
  getAdminChild,
  getAdminDevice,
  getAdminFamily,
  getAdminGeofence,
  getAdminUser,
} from '@/lib/api-client'
import { adminQueryKeys } from '../query-keys'

export type RelatedRecordRef = {
  type: AdminRelatedRecordType
  id: string | null | undefined
}

export const RELATED_RECORD_STALE_TIME = 60_000
export const RELATED_RECORD_GC_TIME = 5 * 60_000

export function getUserRecordQueryOptions(id: string) {
  return queryOptions({
    queryKey: adminQueryKeys.users.detail(id),
    queryFn: () => getAdminUser(id),
    staleTime: RELATED_RECORD_STALE_TIME,
    gcTime: RELATED_RECORD_GC_TIME,
  })
}

export function getChildRecordQueryOptions(id: string) {
  return queryOptions({
    queryKey: adminQueryKeys.children.detail(id),
    queryFn: () => getAdminChild(id),
    staleTime: RELATED_RECORD_STALE_TIME,
    gcTime: RELATED_RECORD_GC_TIME,
  })
}

export function getDeviceRecordQueryOptions(id: string) {
  return queryOptions({
    queryKey: adminQueryKeys.devices.detail(id),
    queryFn: () => getAdminDevice(id),
    staleTime: RELATED_RECORD_STALE_TIME,
    gcTime: RELATED_RECORD_GC_TIME,
  })
}

export function getFamilyRecordQueryOptions(id: string) {
  return queryOptions({
    queryKey: adminQueryKeys.families.detail(id),
    queryFn: () => getAdminFamily(id),
    staleTime: RELATED_RECORD_STALE_TIME,
    gcTime: RELATED_RECORD_GC_TIME,
  })
}

export function getGeofenceRecordQueryOptions(id: string) {
  return queryOptions({
    queryKey: adminQueryKeys.geofences.detail(id),
    queryFn: () => getAdminGeofence(id),
    staleTime: RELATED_RECORD_STALE_TIME,
    gcTime: RELATED_RECORD_GC_TIME,
  })
}

export function getRelatedRecordQueryOptions(record: {
  type: AdminRelatedRecordType
  id: string
}) {
  switch (record.type) {
    case 'user':
      return getUserRecordQueryOptions(record.id)
    case 'child':
      return getChildRecordQueryOptions(record.id)
    case 'device':
      return getDeviceRecordQueryOptions(record.id)
    case 'family':
      return getFamilyRecordQueryOptions(record.id)
    case 'geofence':
      return getGeofenceRecordQueryOptions(record.id)
  }
}

export function prefetchRelatedRecord(
  queryClient: QueryClient,
  record: RelatedRecordRef
) {
  if (!record.id) {
    return Promise.resolve()
  }

  return queryClient.prefetchQuery(
    getRelatedRecordQueryOptions({
      type: record.type,
      id: record.id,
    }) as FetchQueryOptions
  )
}
