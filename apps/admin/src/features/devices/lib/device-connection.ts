import {
  TELEMETRY_OFFLINE_AFTER_MS,
  TELEMETRY_STALE_AFTER_MS,
  type AdminDeviceConnectionState,
  type AdminDeviceListItemDto,
} from '@stepwhere/types'

type DeviceConnectionInput = Pick<
  AdminDeviceListItemDto,
  'lastSeenAt' | 'status' | 'telemetryReliability'
>

/**
 * Admin-facing connection state. Provisioning remains separate so a silent,
 * bound tracker never loses permission to send the packet that recovers it.
 */
export function deriveDeviceConnectionState(
  device: DeviceConnectionInput,
  now = Date.now()
): AdminDeviceConnectionState {
  if (device.status === 'blocked') {
    return 'offline'
  }

  if (device.telemetryReliability.latestDeviceState === 'offline') {
    return 'offline'
  }

  if (device.telemetryReliability.latestDeviceState === 'sleep') {
    return 'sleep'
  }

  if (!device.lastSeenAt) {
    return 'never'
  }

  const lastSeenAt = new Date(device.lastSeenAt).getTime()

  if (!Number.isFinite(lastSeenAt)) {
    return 'never'
  }

  const ageMs = Math.max(0, now - lastSeenAt)

  if (ageMs > TELEMETRY_OFFLINE_AFTER_MS) {
    return 'offline'
  }

  if (ageMs > TELEMETRY_STALE_AFTER_MS) {
    return 'stale'
  }

  return 'connected'
}

export function formatDeviceConnectionState(state: AdminDeviceConnectionState) {
  switch (state) {
    case 'connected':
      return 'Connected'
    case 'stale':
      return 'Stale'
    case 'offline':
      return 'Offline'
    case 'sleep':
      return 'Sleep'
    case 'never':
    default:
      return 'Never seen'
  }
}
