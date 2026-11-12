import {
  QA_UNIT_STAGES,
  type QaFirmwareChannel,
  type QaUnitListItemDto,
  type QaUnitStage,
  type QaUnitStageStatus,
} from '@stepwhere/types'
import { Check, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { StatusBadge } from '@/features/admin/components/status-badge'
import {
  stageIndex,
  stageLabels,
  stageStatusLabels,
} from '../lib/qa-unit-format'

type UnitState = Pick<QaUnitListItemDto, 'stage' | 'stageStatus' | 'fieldState'>

/** One pill for where the unit stands: in progress, failed, or its field state once delivered. */
export function UnitStatusBadge({ unit }: { unit: UnitState }) {
  if (unit.stageStatus === 'scrapped') {
    return <StatusBadge tone='muted'>Scrapped</StatusBadge>
  }
  if (unit.stageStatus === 'failed') {
    return <StatusBadge tone='danger'>Failed</StatusBadge>
  }
  if (unit.fieldState === 'active') {
    return <StatusBadge tone='success'>Active</StatusBadge>
  }
  if (unit.fieldState === 'offline') {
    return <StatusBadge tone='muted'>Offline</StatusBadge>
  }
  if (unit.fieldState === 'never_seen') {
    return <StatusBadge tone='muted'>Never seen</StatusBadge>
  }
  if (unit.stage === 'ready_to_ship' && unit.stageStatus === 'passed') {
    return <StatusBadge tone='success'>Ready</StatusBadge>
  }
  if (unit.stage === 'shipped') {
    return <StatusBadge tone='info'>In transit</StatusBadge>
  }
  if (unit.stage === 'registered' && unit.stageStatus === 'pending') {
    return <StatusBadge tone='info'>Registered</StatusBadge>
  }
  return <StatusBadge tone='info'>In QA</StatusBadge>
}

export function StageStatusBadge({ status }: { status: QaUnitStageStatus }) {
  const tone =
    status === 'passed'
      ? 'success'
      : status === 'failed'
        ? 'danger'
        : status === 'scrapped'
          ? 'muted'
          : 'info'
  return <StatusBadge tone={tone}>{stageStatusLabels[status]}</StatusBadge>
}

export function FirmwareChannelBadge({
  channel,
}: {
  channel: QaFirmwareChannel
}) {
  return (
    <StatusBadge tone={channel === 'qa' ? 'warning' : 'info'}>
      {channel === 'qa' ? 'QA' : 'Production'}
    </StatusBadge>
  )
}

/** Compact QA/PROD tag for tables and pickers. */
export function FirmwareChannelTag({
  channel,
}: {
  channel: QaFirmwareChannel | null
}) {
  if (!channel) return null
  return (
    <span
      className={cn(
        'rounded-xs px-1 text-2xs font-medium uppercase',
        channel === 'qa'
          ? 'bg-caution-wash text-caution'
          : 'bg-info-wash text-info'
      )}
    >
      {channel === 'qa' ? 'QA' : 'Prod'}
    </span>
  )
}

function segmentTone(
  index: number,
  current: number,
  status: QaUnitStageStatus
) {
  if (index < current) return 'bg-ok'
  if (index > current) return 'bg-white/8'
  if (status === 'failed') return 'bg-breach'
  if (status === 'scrapped') return 'bg-ink-4'
  if (status === 'passed') return 'bg-ok'
  return 'bg-toggle'
}

/** Ten short segments: done, current, still to go. */
export function StageBar({
  stage,
  stageStatus,
  className,
}: Pick<QaUnitListItemDto, 'stage' | 'stageStatus'> & { className?: string }) {
  const current = stageIndex(stage)

  return (
    <span
      className={cn('inline-flex items-center gap-[3px]', className)}
      role='img'
      aria-label={`${stageLabels[stage]}, ${stageStatusLabels[stageStatus].toLowerCase()}`}
    >
      {QA_UNIT_STAGES.map((entry, index) => (
        <i
          key={entry}
          className={cn(
            'block h-1 w-2 rounded-full',
            segmentTone(index, current, stageStatus)
          )}
        />
      ))}
    </span>
  )
}

/** The full stage stepper on the unit page. */
export function StageStepper({
  unit,
  times,
  formatTime,
}: {
  unit: Pick<QaUnitListItemDto, 'stage' | 'stageStatus'>
  times: Map<QaUnitStage, string>
  formatTime: (value: string) => string
}) {
  const current = stageIndex(unit.stage)

  return (
    <ol className='grid grid-cols-5 gap-y-5 lg:grid-cols-10'>
      {QA_UNIT_STAGES.map((stage, index) => {
        const done =
          index < current ||
          (index === current && unit.stageStatus === 'passed')
        const failed = index === current && unit.stageStatus === 'failed'
        const active = index === current && unit.stageStatus === 'pending'
        const time = index <= current ? times.get(stage) : undefined

        return (
          <li key={stage} className='relative flex flex-col items-center'>
            {index > 0 ? (
              <span
                aria-hidden='true'
                className={cn(
                  'absolute top-2.5 right-1/2 h-px w-full',
                  index <= current ? 'bg-ok/60' : 'bg-line'
                )}
              />
            ) : null}
            <span
              className={cn(
                'relative z-10 grid size-5 place-items-center rounded-full text-2xs font-semibold tabular',
                done && 'bg-ok-wash text-ok shadow-[inset_0_0_0_1px_var(--ok)]',
                failed &&
                  'bg-breach-wash text-breach shadow-[inset_0_0_0_1px_var(--breach)]',
                active &&
                  'bg-toggle-wash text-toggle shadow-[inset_0_0_0_1px_var(--toggle)]',
                !done &&
                  !failed &&
                  !active &&
                  'bg-canvas text-ink-4 shadow-[inset_0_0_0_1px_var(--line)]'
              )}
            >
              {done ? (
                <Check className='size-3' />
              ) : failed ? (
                <X className='size-3' />
              ) : (
                index + 1
              )}
            </span>
            <span
              className={cn(
                'mt-2 text-center text-xs',
                failed
                  ? 'font-medium text-breach'
                  : index === current
                    ? 'font-medium text-ink'
                    : index < current
                      ? 'text-ink-2'
                      : 'text-ink-4'
              )}
            >
              {stageLabels[stage]}
            </span>
            <span className='mt-0.5 h-4 text-2xs text-ink-4 tabular'>
              {time ? formatTime(time) : null}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
