import type {
  AdminDeviceTelemetryReliabilityDto,
  AdminDeviceDto,
} from '@stepwhere/types'

export type TelemetryReliabilityStatus =
  | 'healthy'
  | 'delayed'
  | 'missing'
  | 'paused'
  | 'unknown'

export type DerivedTelemetryReliability = {
  status: TelemetryReliabilityStatus
  monitoring: boolean
  packetAgeSeconds: number | null
  lateBySeconds: number
  onTimePackets: number
  latePackets: number
  missedPackets: number
  currentMissedPackets: number
  reliabilityPercent: number | null
}

export function deriveTelemetryReliability(
  device: Pick<AdminDeviceDto, 'status'>,
  snapshot: AdminDeviceTelemetryReliabilityDto,
  now = Date.now()
): DerivedTelemetryReliability {
  const lastPacketMs = snapshot.lastPacketAt
    ? new Date(snapshot.lastPacketAt).getTime()
    : Number.NaN
  const windowStartedMs = new Date(snapshot.windowStartedAt).getTime()
  const hasPacket = Number.isFinite(lastPacketMs)
  const packetAgeMs = hasPacket ? Math.max(0, now - lastPacketMs) : null
  const packetAgeSeconds = packetAgeMs == null
    ? null
    : Math.floor(packetAgeMs / 1000)
  const monitoring =
    device.status === 'active' && snapshot.latestDeviceState === 'active'

  let status: TelemetryReliabilityStatus
  let provisionalLatePackets = 0
  let currentMissedPackets = 0

  if (!hasPacket || snapshot.latestDeviceState === null) {
    status = 'unknown'
  } else if (!monitoring) {
    status = 'paused'
  } else if ((packetAgeSeconds ?? 0) < snapshot.lateAtSeconds) {
    status = 'healthy'
  } else if ((packetAgeSeconds ?? 0) < snapshot.missingAtSeconds) {
    status = 'delayed'
    provisionalLatePackets = 1
  } else {
    status = 'missing'
    provisionalLatePackets = 1

    const effectiveOpenIntervalMs = Math.max(
      0,
      now - Math.max(lastPacketMs, windowStartedMs)
    )
    currentMissedPackets = Math.max(
      1,
      Math.floor(
        effectiveOpenIntervalMs /
          (snapshot.expectedIntervalSeconds * 1000)
      ) - 1
    )
  }

  const onTimePackets = snapshot.completedOnTimePackets
  const latePackets = snapshot.completedLatePackets + provisionalLatePackets
  const missedPackets =
    snapshot.completedMissedPackets + currentMissedPackets
  const scoredPackets = onTimePackets + latePackets + missedPackets

  return {
    status,
    monitoring,
    packetAgeSeconds,
    lateBySeconds:
      packetAgeSeconds == null
        ? 0
        : Math.max(0, packetAgeSeconds - snapshot.expectedIntervalSeconds),
    onTimePackets,
    latePackets,
    missedPackets,
    currentMissedPackets,
    reliabilityPercent:
      scoredPackets === 0
        ? null
        : Math.round((onTimePackets / scoredPackets) * 100),
  }
}

export function formatTelemetryReliabilityStatus(
  status: TelemetryReliabilityStatus
) {
  switch (status) {
    case 'healthy':
      return 'Healthy'
    case 'delayed':
      return 'Delayed'
    case 'missing':
      return 'Missing'
    case 'paused':
      return 'Paused'
    case 'unknown':
    default:
      return 'No data'
  }
}
