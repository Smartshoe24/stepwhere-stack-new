import type {
  AdminActivityQuery,
  AdminBanUserInput,
  AdminBulkAcknowledgeGeofenceBreachesInput,
  AdminBindDeviceInput,
  AdminBulkCreateDeviceInput,
  AdminBulkCreateDeviceResultDto,
  AdminAcknowledgeGeofenceBreachInput,
  AdminChildDetailDto,
  AdminChildListResponseDto,
  AdminChildrenListQuery,
  AdminCreateChildForUserInput,
  AdminReleaseDeviceOwnershipInput,
  AdminReleaseDeviceOwnershipResultDto,
  AdminCreateFamilyInput,
  AdminCreateDeviceInput,
  AdminDeviceDetailDto,
  AdminDeviceDto,
  AdminDeviceLiveTelemetryDto,
  AdminDeviceListResponseDto,
  AdminDevicesListQuery,
  AdminFamilyDetailDto,
  AdminFamilyListResponseDto,
  AdminFamiliesListQuery,
  AdminGeofenceBreachCountsDto,
  AdminGeofenceDetailDto,
  AdminGeofenceEventDto,
  AdminGeofenceEventListResponseDto,
  AdminGeofenceEventsListQuery,
  AdminGeofenceListResponseDto,
  AdminGeofenceBreachesListQuery,
  AdminGeofencesListQuery,
  AdminAddFamilyMemberInput,
  AdminSetupResultDto,
  AdminSetupStatusDto,
  AdminLocationEventListResponseDto,
  AdminLocationEventsListQuery,
  AdminTransferFamilyAdminInput,
  AdminUpdateChildInput,
  AdminUpdateDeviceInput,
  AdminUpdateUserInput,
  AdminUserDetailDto,
  AdminUserListItemDto,
  AdminUserListResponseDto,
  AdminUsersListQuery,
  ApiErrorDto,
  ApiSuccessDto,
  AuthSessionDto,
  DeviceBindResultDto,
  DeviceUnbindResultDto,
  ChildActivityResponseDto,
  ChildTrailResponseDto,
  CompleteAdminSetupInput,
  PrepareOtpInput,
  PrepareOtpResponseDto,
  PreviewAccessEntryDto,
  PreviewAccessStateDto,
  CreatePreviewAccessEntryInput,
  CreateQaBenchJobInput,
  CreateQaFirmwareUploadInput,
  CreateQaStationInput,
  QaBenchJobDto,
  QaBenchJobLogDto,
  QaFirmwareUploadDto,
  QaOverviewDto,
  QaSerialBufferDto,
  QaSerialCloseInput,
  QaSerialOpenInput,
  QaSerialWriteInput,
  QaStationDto,
  QaStationPairingDto,
  QaStationSlotsDto,
  QaStationUnitDto,
  QaStationTestRunDto,
  QaUnitDetailDto,
  QaUnitListResponseDto,
  QaUnitsListQuery,
  SetQaUnitStageInput,
  UpdatePreviewAccessEntryInput,
  UpdateQaStationSlotsInput,
  UpdateQaUnitInput,
  VerifyOtpInput,
} from '@stepwhere/types'

// An empty value means "same origin" (the local dev stack proxies the API).
export const stepwhereApiBaseUrl =
  import.meta.env.VITE_STEPWHERE_API_URL === ''
    ? window.location.origin
    : (import.meta.env.VITE_STEPWHERE_API_URL ?? 'http://localhost:8223')

type UnauthorizedHandler = (() => Promise<void> | void) | null

export type ApiRequestOptions = {
  suppressUnauthorized?: boolean
  timeoutMs?: number
}

let unauthorizedHandler: UnauthorizedHandler = null
const DEFAULT_API_TIMEOUT_MS = 15_000
const AUTH_BOOTSTRAP_TIMEOUT_MS = 10_000

export class ApiNetworkError extends Error {
  readonly cause: unknown
  readonly baseUrl: string

  constructor(baseUrl: string, cause: unknown) {
    super(`Unable to reach Stepwhere API at ${baseUrl}.`)
    this.name = 'ApiNetworkError'
    this.baseUrl = baseUrl
    this.cause = cause
  }
}

export class ApiTimeoutError extends Error {
  readonly baseUrl: string
  readonly timeoutMs: number

  constructor(baseUrl: string, timeoutMs: number) {
    super(`Stepwhere API did not respond within ${timeoutMs / 1000} seconds.`)
    this.name = 'ApiTimeoutError'
    this.baseUrl = baseUrl
    this.timeoutMs = timeoutMs
  }
}

export class ApiError extends Error {
  readonly code?: string
  readonly details?: unknown
  readonly status: number

  constructor(status: number, payload?: ApiErrorDto) {
    super(payload?.message ?? `Request failed with status ${status}.`)
    this.name = 'ApiError'
    this.status = status
    this.code = payload?.code
    this.details = payload?.details
  }
}

export function setApiUnauthorizedHandler(handler: UnauthorizedHandler) {
  unauthorizedHandler = handler
}

export function toQueryString(query: Record<string, unknown>) {
  const searchParams = new URLSearchParams()

  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') {
      continue
    }

    if (Array.isArray(value)) {
      for (const entry of value) {
        if (entry !== undefined && entry !== null && entry !== '') {
          searchParams.append(key, String(entry))
        }
      }
      continue
    }

    searchParams.set(key, String(value))
  }

  const serialized = searchParams.toString()
  return serialized ? `?${serialized}` : ''
}

async function parseJson<T>(response: Response): Promise<T | null> {
  const text = await response.text()

  if (!text) {
    return null
  }

  return JSON.parse(text) as T
}

async function apiRequest<T>(
  path: string,
  init?: RequestInit,
  options?: ApiRequestOptions
) {
  const headers = new Headers(init?.headers)
  headers.set('accept', 'application/json')

  if (init?.body && !headers.has('content-type')) {
    headers.set('content-type', 'application/json')
  }

  const timeoutMs = options?.timeoutMs ?? DEFAULT_API_TIMEOUT_MS
  const requestController = new AbortController()
  const callerSignal = init?.signal
  let didTimeout = false

  const abortFromCaller = () => {
    requestController.abort(callerSignal?.reason)
  }

  if (callerSignal?.aborted) {
    abortFromCaller()
  } else {
    callerSignal?.addEventListener('abort', abortFromCaller, { once: true })
  }

  const timeout = setTimeout(() => {
    didTimeout = true
    requestController.abort()
  }, timeoutMs)

  try {
    let response: Response

    try {
      response = await fetch(`${stepwhereApiBaseUrl}${path}`, {
        ...init,
        credentials: 'include',
        headers,
        signal: requestController.signal,
      })
    } catch (error) {
      if (didTimeout) {
        throw new ApiTimeoutError(stepwhereApiBaseUrl, timeoutMs)
      }

      if (callerSignal?.aborted) {
        throw error
      }

      throw new ApiNetworkError(stepwhereApiBaseUrl, error)
    }

    if (!response.ok) {
      const payload = await parseJson<ApiErrorDto>(response)

      if (response.status === 401 && !options?.suppressUnauthorized) {
        await unauthorizedHandler?.()
      }

      throw new ApiError(response.status, payload ?? undefined)
    }

    const payload = await parseJson<ApiSuccessDto<T>>(response)

    if (!payload) {
      throw new Error('Server returned an empty response body.')
    }

    return payload.data
  } catch (error) {
    if (didTimeout && !(error instanceof ApiTimeoutError)) {
      throw new ApiTimeoutError(stepwhereApiBaseUrl, timeoutMs)
    }

    throw error
  } finally {
    clearTimeout(timeout)
    callerSignal?.removeEventListener('abort', abortFromCaller)
  }
}

export function prepareOtp(input: PrepareOtpInput) {
  return apiRequest<PrepareOtpResponseDto>('/v1/auth/prepare-otp', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function verifyOtp(input: VerifyOtpInput & { challengeToken: string }) {
  return apiRequest<AuthSessionDto>('/v1/auth/verify-otp', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function getSession() {
  return apiRequest<AuthSessionDto>('/v1/auth/session', undefined, {
    suppressUnauthorized: true,
    timeoutMs: AUTH_BOOTSTRAP_TIMEOUT_MS,
  })
}

/** First-run admin setup: `required` only while no admin exists (public). */
export function getAdminSetupStatus() {
  return apiRequest<AdminSetupStatusDto>('/v1/admin/setup', undefined, {
    suppressUnauthorized: true,
    timeoutMs: AUTH_BOOTSTRAP_TIMEOUT_MS,
  })
}

export function completeAdminSetup(input: CompleteAdminSetupInput) {
  return apiRequest<AdminSetupResultDto>(
    '/v1/admin/setup',
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
    { suppressUnauthorized: true }
  )
}

export function signOut(options?: ApiRequestOptions) {
  return apiRequest<Record<string, unknown>>(
    '/v1/auth/sign-out',
    { method: 'POST' },
    options
  )
}

export function listAdminUsers(query: AdminUsersListQuery) {
  return apiRequest<AdminUserListResponseDto>(
    `/v1/admin/users${toQueryString(query)}`
  )
}

export function getAdminUser(userId: string) {
  return apiRequest<AdminUserDetailDto | null>(`/v1/admin/users/${userId}`)
}

export function updateAdminUser(userId: string, input: AdminUpdateUserInput) {
  return apiRequest<AdminUserListItemDto>(`/v1/admin/users/${userId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

export function createAdminChildForUser(
  userId: string,
  input: AdminCreateChildForUserInput
) {
  return apiRequest<AdminChildDetailDto>(`/v1/admin/users/${userId}/children`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function banAdminUser(userId: string, input: AdminBanUserInput) {
  return apiRequest<AdminUserListItemDto>(`/v1/admin/users/${userId}/ban`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function unbanAdminUser(userId: string) {
  return apiRequest<AdminUserListItemDto>(`/v1/admin/users/${userId}/unban`, {
    method: 'POST',
    body: JSON.stringify({}),
  })
}

export function listAdminChildren(query: AdminChildrenListQuery) {
  return apiRequest<AdminChildListResponseDto>(
    `/v1/admin/children${toQueryString(query)}`
  )
}

export function getAdminChild(childId: string) {
  return apiRequest<AdminChildDetailDto | null>(`/v1/admin/children/${childId}`)
}

export function updateAdminChild(
  childId: string,
  input: AdminUpdateChildInput
) {
  return apiRequest<AdminChildDetailDto>(`/v1/admin/children/${childId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

export function listAdminDevices(query: AdminDevicesListQuery) {
  return apiRequest<AdminDeviceListResponseDto>(
    `/v1/admin/devices${toQueryString(query)}`
  )
}

export function listAdminFamilies(query: AdminFamiliesListQuery) {
  return apiRequest<AdminFamilyListResponseDto>(
    `/v1/admin/families${toQueryString(query)}`
  )
}

export function listAdminGeofences(query: AdminGeofencesListQuery) {
  return apiRequest<AdminGeofenceListResponseDto>(
    `/v1/admin/geofences${toQueryString(query)}`
  )
}

export function getAdminGeofence(geofenceId: string) {
  return apiRequest<AdminGeofenceDetailDto | null>(
    `/v1/admin/geofences/${geofenceId}`
  )
}

export function listAdminGeofenceEvents(
  geofenceId: string,
  query: AdminGeofenceEventsListQuery
) {
  return apiRequest<AdminGeofenceEventListResponseDto>(
    `/v1/admin/geofences/${geofenceId}/events${toQueryString(query)}`
  )
}

export function listAdminGeofenceBreaches(
  query: AdminGeofenceBreachesListQuery
) {
  return apiRequest<AdminGeofenceEventListResponseDto>(
    `/v1/admin/geofence-breaches${toQueryString(query)}`
  )
}

export function getAdminGeofenceBreachCounts() {
  return apiRequest<AdminGeofenceBreachCountsDto>(
    '/v1/admin/geofence-breaches/counts'
  )
}

export function acknowledgeAdminGeofenceBreach(
  geofenceEventId: string,
  input: AdminAcknowledgeGeofenceBreachInput
) {
  return apiRequest<AdminGeofenceEventDto | null>(
    `/v1/admin/geofence-breaches/${geofenceEventId}/ack`,
    {
      method: 'POST',
      body: JSON.stringify(input),
    }
  )
}

export function acknowledgeAdminGeofenceBreaches(
  input: AdminBulkAcknowledgeGeofenceBreachesInput
) {
  return apiRequest<AdminGeofenceBreachCountsDto>(
    '/v1/admin/geofence-breaches/ack',
    {
      method: 'POST',
      body: JSON.stringify(input),
    }
  )
}

export function getAdminFamily(familyId: string) {
  return apiRequest<AdminFamilyDetailDto | null>(
    `/v1/admin/families/${familyId}`
  )
}

export function createAdminFamily(input: AdminCreateFamilyInput) {
  return apiRequest<AdminFamilyDetailDto>('/v1/admin/families', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function addAdminFamilyMember(
  familyId: string,
  input: AdminAddFamilyMemberInput
) {
  return apiRequest<AdminFamilyDetailDto>(
    `/v1/admin/families/${familyId}/members`,
    {
      method: 'POST',
      body: JSON.stringify(input),
    }
  )
}

export function transferAdminFamilyAdmin(
  familyId: string,
  input: AdminTransferFamilyAdminInput
) {
  return apiRequest<AdminFamilyDetailDto>(
    `/v1/admin/families/${familyId}/admin`,
    {
      method: 'POST',
      body: JSON.stringify(input),
    }
  )
}

export function createAdminFamilyJoinCode(
  familyId: string,
  input: { phoneNumber: string; expiresAt?: string | null }
) {
  return apiRequest<AdminFamilyDetailDto>(
    `/v1/admin/families/${familyId}/join-codes`,
    {
      method: 'POST',
      body: JSON.stringify(input),
    }
  )
}

export function revokeAdminFamilyJoinCode(
  familyId: string,
  joinCodeId: string
) {
  return apiRequest<AdminFamilyDetailDto>(
    `/v1/admin/families/${familyId}/join-codes/${joinCodeId}/revoke`,
    {
      method: 'POST',
      body: JSON.stringify({}),
    }
  )
}

export function getAdminDevice(deviceId: string) {
  return apiRequest<AdminDeviceDetailDto | null>(
    `/v1/admin/devices/${deviceId}`
  )
}

export function getAdminDeviceLiveTelemetry(deviceId: string) {
  return apiRequest<AdminDeviceLiveTelemetryDto>(
    `/v1/admin/devices/${deviceId}/live`
  )
}

export function listAdminDeviceLocationEvents(
  deviceId: string,
  query: AdminLocationEventsListQuery
) {
  return apiRequest<AdminLocationEventListResponseDto>(
    `/v1/admin/devices/${deviceId}/location-events${toQueryString(query)}`
  )
}

export function getAdminChildActivity(
  childId: string,
  query: AdminActivityQuery
) {
  return apiRequest<ChildActivityResponseDto>(
    `/v1/admin/children/${childId}/activity${toQueryString(query)}`
  )
}

export function listAdminChildLocationEvents(
  childId: string,
  query: AdminLocationEventsListQuery
) {
  return apiRequest<AdminLocationEventListResponseDto>(
    `/v1/admin/children/${childId}/location-events${toQueryString(query)}`
  )
}

export function getAdminChildTrail(
  childId: string,
  query: { distanceMeters?: number; geometry?: 'filtered' | 'roads' }
) {
  return apiRequest<ChildTrailResponseDto>(
    `/v1/admin/children/${childId}/trail${toQueryString(query)}`
  )
}

export function createAdminDevice(input: AdminCreateDeviceInput) {
  return apiRequest<AdminDeviceDto>('/v1/admin/devices', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function bulkCreateAdminDevices(input: AdminBulkCreateDeviceInput) {
  return apiRequest<AdminBulkCreateDeviceResultDto>('/v1/admin/devices/bulk', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function updateAdminDevice(
  deviceId: string,
  input: AdminUpdateDeviceInput
) {
  return apiRequest<AdminDeviceDto>(`/v1/admin/devices/${deviceId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

export function bindAdminDevice(deviceId: string, input: AdminBindDeviceInput) {
  return apiRequest<DeviceBindResultDto>(`/v1/admin/devices/${deviceId}/bind`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function releaseAdminDeviceOwnership(
  input: AdminReleaseDeviceOwnershipInput
) {
  return apiRequest<AdminReleaseDeviceOwnershipResultDto>(
    '/v1/admin/billing/ownership-release',
    {
      method: 'POST',
      body: JSON.stringify(input),
    }
  )
}

export function unbindAdminDevice(deviceId: string) {
  return apiRequest<DeviceUnbindResultDto>(
    `/v1/admin/devices/${deviceId}/unbind`,
    {
      method: 'POST',
    }
  )
}

export function getPreviewAccessState() {
  return apiRequest<PreviewAccessStateDto>('/v1/admin/preview-access')
}

export function createPreviewAccessEntry(input: CreatePreviewAccessEntryInput) {
  return apiRequest<PreviewAccessEntryDto>('/v1/admin/preview-access', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function updatePreviewAccessEntry(
  entryId: string,
  input: UpdatePreviewAccessEntryInput
) {
  return apiRequest<PreviewAccessEntryDto>(
    `/v1/admin/preview-access/${entryId}`,
    {
      method: 'PATCH',
      body: JSON.stringify(input),
    }
  )
}

export function deletePreviewAccessEntry(entryId: string) {
  return apiRequest<PreviewAccessEntryDto>(
    `/v1/admin/preview-access/${entryId}`,
    { method: 'DELETE' }
  )
}

// QA bench ------------------------------------------------------------------

export function listQaStations() {
  return apiRequest<QaStationDto[]>('/v1/admin/qa/stations')
}

export function createQaStation(input: CreateQaStationInput) {
  return apiRequest<QaStationPairingDto>('/v1/admin/qa/stations', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function renameQaStation(stationId: string, input: CreateQaStationInput) {
  return apiRequest<QaStationDto>(`/v1/admin/qa/stations/${stationId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

export function createQaStationPairingCode(stationId: string) {
  return apiRequest<QaStationPairingDto>(
    `/v1/admin/qa/stations/${stationId}/pairing-code`,
    { method: 'POST' }
  )
}

export function revokeQaStation(stationId: string) {
  return apiRequest<{ revoked: true }>(`/v1/admin/qa/stations/${stationId}`, {
    method: 'DELETE',
  })
}

export function requestQaHardwareScan(stationId: string) {
  return apiRequest<{ requested: true }>(
    `/v1/admin/qa/stations/${stationId}/hardware-scan`,
    { method: 'POST' }
  )
}

export function listQaFirmwareUploads(limit = 20) {
  return apiRequest<QaFirmwareUploadDto[]>(
    `/v1/admin/qa/firmware-uploads${toQueryString({ limit })}`
  )
}

export function createQaFirmwareUpload(input: CreateQaFirmwareUploadInput) {
  return apiRequest<QaFirmwareUploadDto>(
    '/v1/admin/qa/firmware-uploads',
    { method: 'POST', body: JSON.stringify(input) },
    { timeoutMs: 60_000 }
  )
}

export function listQaBenchJobs(stationId: string, limit = 20) {
  return apiRequest<QaBenchJobDto[]>(
    `/v1/admin/qa/stations/${stationId}/jobs${toQueryString({ limit })}`
  )
}

export function createQaBenchJob(stationId: string, input: CreateQaBenchJobInput) {
  return apiRequest<QaBenchJobDto>(`/v1/admin/qa/stations/${stationId}/jobs`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function cancelQaBenchJob(jobId: string) {
  return apiRequest<QaBenchJobDto>(`/v1/admin/qa/jobs/${jobId}/cancel`, {
    method: 'POST',
  })
}

export function getQaBenchJobLog(jobId: string) {
  return apiRequest<QaBenchJobLogDto>(`/v1/admin/qa/jobs/${jobId}/log`)
}

export function openQaSerial(stationId: string, input: QaSerialOpenInput) {
  return apiRequest<{ requested: true }>(
    `/v1/admin/qa/stations/${stationId}/serial/open`,
    { method: 'POST', body: JSON.stringify(input) }
  )
}

export function closeQaSerial(stationId: string, input: QaSerialCloseInput) {
  return apiRequest<{ requested: true }>(
    `/v1/admin/qa/stations/${stationId}/serial/close`,
    { method: 'POST', body: JSON.stringify(input) }
  )
}

export function writeQaSerial(stationId: string, input: QaSerialWriteInput) {
  return apiRequest<{ requested: true }>(
    `/v1/admin/qa/stations/${stationId}/serial/write`,
    { method: 'POST', body: JSON.stringify(input) }
  )
}

export function getQaSerialBuffer(stationId: string, path: string) {
  return apiRequest<QaSerialBufferDto>(
    `/v1/admin/qa/stations/${stationId}/serial/buffer${toQueryString({ path })}`
  )
}

export function getQaOverview() {
  return apiRequest<QaOverviewDto>('/v1/admin/qa/overview')
}

export function listQaUnits(query: QaUnitsListQuery) {
  return apiRequest<QaUnitListResponseDto>(
    `/v1/admin/qa/units${toQueryString(query)}`
  )
}

export function getQaUnit(unitId: string) {
  return apiRequest<QaUnitDetailDto>(`/v1/admin/qa/units/${unitId}`)
}

export function updateQaUnit(unitId: string, input: UpdateQaUnitInput) {
  return apiRequest<QaUnitDetailDto>(`/v1/admin/qa/units/${unitId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

export function setQaUnitStage(unitId: string, input: SetQaUnitStageInput) {
  return apiRequest<QaUnitDetailDto>(`/v1/admin/qa/units/${unitId}/stage`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function addQaUnitNote(unitId: string, note: string) {
  return apiRequest<QaUnitDetailDto>(`/v1/admin/qa/units/${unitId}/notes`, {
    method: 'POST',
    body: JSON.stringify({ note }),
  })
}

export function getQaStationUnit(stationId: string) {
  return apiRequest<QaStationUnitDto>(
    `/v1/admin/qa/stations/${stationId}/unit`
  )
}

export function getQaStationSlots(stationId: string) {
  return apiRequest<QaStationSlotsDto>(
    `/v1/admin/qa/stations/${stationId}/slots`
  )
}

export function updateQaStationSlots(
  stationId: string,
  input: UpdateQaStationSlotsInput
) {
  return apiRequest<QaStationSlotsDto>(
    `/v1/admin/qa/stations/${stationId}/slots`,
    { method: 'PUT', body: JSON.stringify(input) }
  )
}

/** Types the same text into several slots' TTL ports; every slot with an open port when `slotIds` is omitted. */
export function sendQaSlotCommand(
  stationId: string,
  input: { slotIds?: string[]; data: string }
) {
  return apiRequest<{ sentTo: string[] }>(
    `/v1/admin/qa/stations/${stationId}/slots/command`,
    { method: 'POST', body: JSON.stringify(input) }
  )
}

export function getQaStationLatestTestRun(stationId: string) {
  return apiRequest<QaStationTestRunDto>(
    `/v1/admin/qa/stations/${stationId}/test-runs/latest`
  )
}
