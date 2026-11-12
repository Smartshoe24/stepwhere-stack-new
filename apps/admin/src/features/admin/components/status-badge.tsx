import type { ReactNode } from 'react'
import type {
  AdminDeviceConnectionState,
  GpsConnectionState,
  GsmConnectionState,
  LocationSource,
} from '@stepwhere/types'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { formatDeviceConnectionState } from '@/features/devices/lib/device-connection'
import {
  formatTelemetryReliabilityStatus,
  type TelemetryReliabilityStatus,
} from '@/features/devices/lib/telemetry-reliability'

type StatusTone =
  | 'default'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'muted'

/** Maps the domain tones used below onto Night Trail pill variants. */
const toneVariant = {
  default: 'secondary',
  success: 'ok',
  warning: 'caution',
  danger: 'breach',
  info: 'info',
  muted: 'muted',
} as const satisfies Record<StatusTone, BadgeProps['variant']>

/**
 * A status pill: always a dot plus a word, never colour alone.
 * `default` has no dot because it carries no state (roles, platforms).
 */
export function StatusBadge({
  children,
  tone = 'default',
  className,
}: {
  children: ReactNode
  tone?: StatusTone
  className?: string
}) {
  return (
    <Badge variant={toneVariant[tone]} className={cn('capitalize', className)}>
      {tone === 'default' ? null : (
        <span
          aria-hidden='true'
          className='size-1.5 shrink-0 rounded-full bg-current'
        />
      )}
      {children}
    </Badge>
  )
}

export function LocationSourceBadge({ source }: { source: LocationSource | 'none' | null }) {
  const label = source === 'gps'
    ? 'GPS fix'
    : source === 'cell'
      ? 'Cell estimate'
      : source === 'network' ? 'Network estimate' : 'No resolved position'
  const tone = source === 'gps' ? 'success' : (source === 'cell' || source === 'network') ? 'info' : 'muted'

  return <StatusBadge tone={tone}>{label}</StatusBadge>
}

export function UserRoleBadge({ role }: { role: 'user' | 'admin' }) {
  return (
    <StatusBadge tone={role === 'admin' ? 'info' : 'default'}>
      {role}
    </StatusBadge>
  )
}

export function UserStatusBadge({
  status,
}: {
  status: 'active' | 'suspended'
}) {
  return (
    <StatusBadge tone={status === 'active' ? 'success' : 'warning'}>
      {status}
    </StatusBadge>
  )
}

export function BanStateBadge({ banned }: { banned: boolean }) {
  return (
    <StatusBadge tone={banned ? 'danger' : 'muted'}>
      {banned ? 'Banned' : 'Not banned'}
    </StatusBadge>
  )
}

export function ChildLifecycleBadge({
  status,
}: {
  status: 'active' | 'archived'
}) {
  return (
    <StatusBadge tone={status === 'active' ? 'success' : 'muted'}>
      {status}
    </StatusBadge>
  )
}

export function ChildTrackingBadge({
  status,
}: {
  status: 'safe' | 'transit' | 'alert' | 'offline'
}) {
  const tone =
    status === 'safe'
      ? 'success'
      : status === 'transit'
        ? 'info'
        : status === 'alert'
          ? 'danger'
          : 'muted'

  return <StatusBadge tone={tone}>{status}</StatusBadge>
}

export function TelemetryStateBadge({
  state,
}: {
  state: 'active' | 'sleep' | 'offline' | 'connecting'
}) {
  const tone =
    state === 'active'
      ? 'success'
      : state === 'connecting'
        ? 'info'
        : state === 'sleep'
          ? 'warning'
          : 'muted'

  return <StatusBadge tone={tone}>{state}</StatusBadge>
}

export function GsmStateBadge({ state }: { state: GsmConnectionState }) {
  const tone =
    state === 'connected' ? 'success' : state === 'stale' ? 'warning' : 'muted'
  return <StatusBadge tone={tone}>GSM {state}</StatusBadge>
}

export function GpsStateBadge({ state }: { state: GpsConnectionState }) {
  const tone =
    state === 'connected'
      ? 'success'
      : state === 'acquiring'
        ? 'info'
        : state === 'stale'
          ? 'warning'
          : 'muted'
  return <StatusBadge tone={tone}>GPS {state}</StatusBadge>
}

export function DevicePlatformBadge({
  platform,
}: {
  platform: 'android' | 'ios' | 'embedded' | 'unknown'
}) {
  return (
    <StatusBadge tone={platform === 'unknown' ? 'muted' : 'default'}>
      {platform}
    </StatusBadge>
  )
}

export function DeviceStatusBadge({
  status,
}: {
  status: 'fresh' | 'active' | 'inactive' | 'blocked'
}) {
  const tone =
    status === 'active'
      ? 'success'
      : status === 'fresh'
        ? 'info'
        : status === 'inactive'
          ? 'warning'
          : 'danger'

  return <StatusBadge tone={tone}>{status}</StatusBadge>
}

export function DeviceConnectionBadge({
  state,
}: {
  state: AdminDeviceConnectionState
}) {
  const tone =
    state === 'connected'
      ? 'success'
      : state === 'stale'
        ? 'warning'
        : state === 'offline'
          ? 'danger'
          : state === 'sleep'
            ? 'info'
            : 'muted'

  return (
    <StatusBadge tone={tone}>{formatDeviceConnectionState(state)}</StatusBadge>
  )
}

export function TelemetryReliabilityBadge({
  status,
}: {
  status: TelemetryReliabilityStatus
}) {
  const tone =
    status === 'healthy'
      ? 'success'
      : status === 'delayed'
        ? 'warning'
        : status === 'missing'
          ? 'danger'
          : 'muted'

  return (
    <StatusBadge tone={tone}>
      {formatTelemetryReliabilityStatus(status)}
    </StatusBadge>
  )
}

export function GeofenceStatusBadge({
  status,
}: {
  status: 'unset' | 'enabled' | 'disabled'
}) {
  const tone =
    status === 'enabled'
      ? 'success'
      : status === 'disabled'
        ? 'warning'
        : 'muted'

  return <StatusBadge tone={tone}>{status}</StatusBadge>
}

export function ContainmentBadge({
  state,
}: {
  state: 'unknown' | 'inside' | 'outside'
}) {
  const tone =
    state === 'inside' ? 'success' : state === 'outside' ? 'danger' : 'muted'

  return <StatusBadge tone={tone}>{state}</StatusBadge>
}

export function GeofenceEventBadge({
  eventType,
}: {
  eventType: 'breached' | 'reentered' | 'reset'
}) {
  const tone =
    eventType === 'breached'
      ? 'danger'
      : eventType === 'reentered'
        ? 'success'
        : 'muted'

  return <StatusBadge tone={tone}>{eventType}</StatusBadge>
}

export function AckStateBadge({ acknowledged }: { acknowledged: boolean }) {
  return (
    <StatusBadge tone={acknowledged ? 'muted' : 'danger'}>
      {acknowledged ? 'Acknowledged' : 'Unacknowledged'}
    </StatusBadge>
  )
}

export function PreviewAccessStatusBadge({
  active,
}: {
  active: boolean | null
}) {
  if (active === null) {
    return <StatusBadge tone='muted'>Unavailable</StatusBadge>
  }

  return (
    <StatusBadge tone={active ? 'success' : 'muted'}>
      {active ? 'Active' : 'Inactive'}
    </StatusBadge>
  )
}
