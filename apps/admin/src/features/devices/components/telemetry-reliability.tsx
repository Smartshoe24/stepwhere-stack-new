import type { AdminDeviceListItemDto } from '@stepwhere/types'
import { Info, RadioTower } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  formatAdminDateTimeWithSeconds,
  formatAdminRelativeDate,
} from '@/lib/date-format'
import {
  DeviceConnectionBadge,
  TelemetryReliabilityBadge,
} from '@/features/admin/components/status-badge'
import { useLiveNow } from '@/hooks/use-live-now'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { deriveDeviceConnectionState } from '../lib/device-connection'
import {
  deriveTelemetryReliability,
  type DerivedTelemetryReliability,
  type TelemetryReliabilityStatus,
} from '../lib/telemetry-reliability'

const cardToneClassNames: Record<TelemetryReliabilityStatus, string> = {
  healthy: 'bg-ok-wash/60 shadow-[inset_0_0_0_1px_rgb(74_222_128/0.18)]',
  delayed: 'bg-caution-wash/60 shadow-[inset_0_0_0_1px_rgb(255_159_67/0.2)]',
  missing: 'bg-breach-wash/60 shadow-[inset_0_0_0_1px_rgb(248_113_113/0.22)]',
  paused: 'bg-raised shadow-[inset_0_0_0_1px_var(--line-faint)]',
  unknown: 'bg-raised shadow-[inset_0_0_0_1px_var(--line-faint)]',
}

function ReliabilityInfoButton({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type='button'
          aria-label={label}
          className='focus-trail -m-2 flex size-10 items-center justify-center rounded-md text-ink-3 transition-colors hover:bg-white/5 hover:text-ink'
        >
          <Info className='size-4' />
        </button>
      </TooltipTrigger>
      <TooltipContent
        side='top'
        sideOffset={6}
        className='max-w-80 leading-relaxed'
      >
        {children}
      </TooltipContent>
    </Tooltip>
  )
}

function getLastSeenExplanation(
  device: AdminDeviceListItemDto,
  derived: DerivedTelemetryReliability
) {
  const packetAge = derived.packetAgeSeconds

  if (packetAge === null) {
    return 'No successful telemetry packet has been ingested for this device.'
  }

  if (derived.status === 'paused') {
    return `Cadence monitoring is paused because the device is ${
      device.status !== 'active'
        ? device.status
        : (device.telemetryReliability.latestDeviceState ?? 'not reporting')
    }. The last successful ingest was ${packetAge} seconds ago.`
  }

  if (derived.status === 'delayed') {
    return `The latest packet is ${derived.lateBySeconds} seconds beyond the 8-second target. It is delayed, but no complete packet slot is confirmed missing yet.`
  }

  if (derived.status === 'missing') {
    return `${derived.currentMissedPackets} expected packet${
      derived.currentMissedPackets === 1 ? ' is' : 's are'
    } currently missing. The last successful ingest was ${packetAge} seconds ago.`
  }

  return `The latest packet arrived ${packetAge} seconds ago. Packets are expected every 8 seconds, with one second of display jitter allowed.`
}

export function LiveLastSeenCard({
  device,
}: {
  device: AdminDeviceListItemDto
}) {
  const now = useLiveNow()
  const derived = deriveTelemetryReliability(
    device,
    device.telemetryReliability,
    now
  )

  return (
    <div
      className={cn(
        'rounded-lg px-4 py-3 transition-colors',
        cardToneClassNames[derived.status]
      )}
    >
      <div className='flex items-center justify-between gap-2'>
        <div className='label-caps'>Last seen</div>
        <ReliabilityInfoButton label='Explain current packet timing'>
          {getLastSeenExplanation(device, derived)}
        </ReliabilityInfoButton>
      </div>
      <div className='mt-1 flex min-h-7 items-center gap-2'>
        <span className='text-lg font-semibold text-ink tabular-nums'>
          {formatAdminRelativeDate(
            device.telemetryReliability.lastPacketAt,
            now
          )}
        </span>
        <TelemetryReliabilityBadge status={derived.status} />
      </div>
      <div className='mt-1 text-xs tabular-nums text-ink-3'>
        {formatAdminDateTimeWithSeconds(
          device.telemetryReliability.lastPacketAt
        )}
      </div>
    </div>
  )
}

export function TelemetryReliabilityCard({
  device,
}: {
  device: AdminDeviceListItemDto
}) {
  const now = useLiveNow()
  const derived = deriveTelemetryReliability(
    device,
    device.telemetryReliability,
    now
  )

  return (
    <div
      className={cn(
        'rounded-lg px-4 py-3 transition-colors',
        cardToneClassNames[derived.status]
      )}
    >
      <div className='flex items-center justify-between gap-2'>
        <div className='label-caps flex items-center gap-2'>
          <RadioTower className='size-3.5' />
          Telemetry reliability
        </div>
        <ReliabilityInfoButton label='Explain telemetry reliability'>
          <span>
            Rolling 30-minute on-time reliability for successful server ingests.
            Packets are expected every 8 seconds; 10–16 seconds is delayed and
            17+ seconds indicates missing packet slots. This is ingest cadence,
            not device-to-server network latency.
          </span>
        </ReliabilityInfoButton>
      </div>
      <div className='mt-1 flex min-h-7 flex-wrap items-baseline gap-x-3 gap-y-1'>
        <span className='text-2xl font-semibold tracking-[-0.02em] text-ink tabular-nums'>
          {derived.reliabilityPercent == null
            ? '—'
            : `${derived.reliabilityPercent}%`}
        </span>
        <TelemetryReliabilityBadge status={derived.status} />
        {derived.reliabilityPercent == null ? (
          <span className='text-xs text-ink-3'>Collecting data</span>
        ) : null}
      </div>
      <div className='mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs tabular-nums text-ink-3'>
        <span>{derived.onTimePackets} on time</span>
        <span>{derived.latePackets} late</span>
        <span>{derived.missedPackets} missed</span>
        {device.telemetryReliability.lastCompletedIntervalSeconds != null ? (
          <span>
            Last interval{' '}
            {device.telemetryReliability.lastCompletedIntervalSeconds.toFixed(
              1
            )}
            s
          </span>
        ) : null}
      </div>
    </div>
  )
}

export function TelemetryReliabilityCell({
  device,
}: {
  device: AdminDeviceListItemDto
}) {
  const now = useLiveNow()
  const derived = deriveTelemetryReliability(
    device,
    device.telemetryReliability,
    now
  )

  return (
    <div className='min-w-36 space-y-1.5'>
      <div className='flex items-center gap-2'>
        <span className='font-semibold text-ink tabular-nums'>
          {derived.reliabilityPercent == null
            ? '—'
            : `${derived.reliabilityPercent}%`}
        </span>
        <TelemetryReliabilityBadge status={derived.status} />
      </div>
      <div className='text-xs tabular-nums text-ink-3'>
        {derived.latePackets} late · {derived.missedPackets} missed
      </div>
    </div>
  )
}

export function LiveDeviceConnectionBadge({
  device,
}: {
  device: AdminDeviceListItemDto
}) {
  const now = useLiveNow()

  return (
    <DeviceConnectionBadge state={deriveDeviceConnectionState(device, now)} />
  )
}
