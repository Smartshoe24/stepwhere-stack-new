import { useState } from 'react'
import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import type { QaBoardTestId, QaSlotDto } from '@stepwhere/types'
import { Check, Circle, Minus, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { formatChipUid } from '@/features/qa-units/lib/qa-unit-format'
import {
  summarizeResult,
  testLabel,
} from '@/features/qa-units/lib/qa-test-format'
import {
  elapsedSince,
  slotBoardId,
  type SlotAction,
  type SlotSegment,
  type SlotView,
} from '../../lib/qa-slot-state'

const tileTone: Record<SlotView['phase'], string> = {
  empty: 'bg-transparent shadow-[inset_0_0_0_1px_var(--line-faint)]',
  flashing: '',
  testing: '',
  waiting: 'bg-caution-wash shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--caution)_32%,transparent)]',
  passed: '',
  failed: 'bg-breach-wash shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--breach)_30%,transparent)]',
  stopped: '',
}

const headlineTone: Record<SlotView['phase'], string> = {
  empty: 'text-ink-4',
  flashing: 'text-ink-2',
  testing: 'text-ink',
  waiting: 'text-caution',
  passed: 'text-ok',
  failed: 'text-breach',
  stopped: 'text-ink-3',
}

const segmentTone: Record<SlotSegment['status'], string> = {
  pending: 'bg-white/[0.07]',
  running: 'bg-ink-2 animate-pulse',
  waiting: 'bg-caution',
  passed: 'bg-ok/70',
  failed: 'bg-breach',
  skipped:
    'bg-[repeating-linear-gradient(135deg,var(--ink-4)_0_2px,transparent_2px_4px)]',
}

/**
 * One slot on the bench: what is running, one bar segment per board test, and
 * on hover the full checklist. Click opens the slot.
 */
export function SlotCard({
  slot,
  view,
  now,
  onOpen,
  onAction,
  actionPending,
}: {
  slot: QaSlotDto
  view: SlotView
  now: number
  onOpen: () => void
  onAction: (action: SlotAction) => void
  actionPending: boolean
}) {
  const [hovered, setHovered] = useState<QaBoardTestId | null>(null)
  const run = slot.run
  const boardId = slotBoardId(slot)
  const job = slot.activeJob
  const stepElapsed =
    view.current?.startedAt && view.phase !== 'waiting'
      ? elapsedSince(view.current.startedAt, now)
      : null
  const total = run ? elapsedSince(run.startedAt, now, run.finishedAt) : null
  // Only actions that answer "Needs you" sit on the card; the rest are in the slot sheet.
  const cardAction =
    view.phase === 'waiting' || view.phase === 'failed' ? view.action : null

  const footer =
    view.phase === 'flashing'
      ? job?.firmware?.version ?? job?.firmware?.fileName ?? 'Identify'
      : view.step
        ? `Step ${view.step.index} of ${view.step.of}`
        : view.phase === 'passed'
          ? 'Unplug, next board'
          : view.phase === 'failed'
            ? `${view.passed} passed · ${view.failed} failed`
            : view.phase === 'empty'
              ? slot.portPath
                ? slot.portOpen
                  ? 'Put a board in'
                  : 'Opening port…'
                : 'Plug the adapter in'
              : null

  return (
    <TooltipPrimitive.Provider delayDuration={250}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>
          <div
            role='button'
            tabIndex={0}
            aria-label={`${slot.label}: ${view.headline}`}
            onClick={onOpen}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                onOpen()
              }
            }}
            className={cn(
              'focus-trail flex min-h-[128px] cursor-pointer flex-col gap-1.5 rounded-lg bg-raised p-3 text-start shadow-[inset_0_0_0_1px_var(--line-faint)] transition-shadow duration-150 hover:shadow-[inset_0_0_0_1px_var(--line-strong)]',
              tileTone[view.phase]
            )}
          >
            <div className='flex items-baseline justify-between gap-2'>
              <span className='truncate text-[13px] font-semibold text-ink'>
                {slot.label}
              </span>
              <span className='shrink-0 font-mono text-[10px] text-ink-4'>
                {slot.probeSerial ? `ST …${slot.probeSerial.slice(-4)}` : ''}
              </span>
            </div>
            <span className='truncate font-mono text-[11px] text-ink-3'>
              {boardId ?? ' '}
            </span>
            <div className='flex items-baseline justify-between gap-2 text-xs'>
              <span className={cn('truncate font-medium', headlineTone[view.phase])}>
                {view.phase === 'passed' ? '✓ ' : ''}
                {view.headline}
              </span>
              <span className='shrink-0 text-[11px] text-ink-3 tabular'>
                {view.phase === 'flashing' && job?.percent != null
                  ? `${job.percent}%`
                  : stepElapsed}
              </span>
            </div>

            {view.phase === 'flashing' ? (
              <div className='mt-auto h-1.5 overflow-hidden rounded-[2px] bg-white/[0.07]'>
                <div
                  className='h-full bg-ink-3 transition-[width] duration-300'
                  style={{ width: `${job?.percent ?? 4}%` }}
                />
              </div>
            ) : view.phase === 'empty' ? (
              <div className='mt-auto' />
            ) : (
              <div className='mt-auto flex gap-[3px]' onMouseLeave={() => setHovered(null)}>
                {view.segments.map((segment) => (
                  <span
                    key={segment.id}
                    onMouseEnter={() => setHovered(segment.id)}
                    className={cn(
                      'h-1.5 flex-1 rounded-[2px]',
                      segmentTone[segment.status],
                      !segment.fromThisRun && segment.status !== 'pending' && 'opacity-50',
                      hovered === segment.id && 'outline-[1.5px] outline-offset-1 outline-ink outline-solid'
                    )}
                  />
                ))}
              </div>
            )}

            {cardAction ? (
              <Button
                size='sm'
                variant={view.phase === 'waiting' ? 'default' : 'outline'}
                className='mt-0.5 h-6 text-[11px]'
                disabled={actionPending || !slot.portOpen}
                onClick={(event) => {
                  event.stopPropagation()
                  onAction(cardAction)
                }}
              >
                {cardAction.label}
              </Button>
            ) : (
              <div className='flex items-baseline justify-between gap-2 text-[11px] text-ink-3'>
                <span className='truncate'>{footer}</span>
                <span className='shrink-0 tabular'>{total}</span>
              </div>
            )}
          </div>
        </TooltipPrimitive.Trigger>
        {view.phase === 'empty' ? null : (
          <TooltipPrimitive.Portal>
            <TooltipPrimitive.Content
              side='right'
              align='start'
              sideOffset={8}
              collisionPadding={12}
              className='z-50 w-[300px] animate-in rounded-xl bg-overlay p-3 text-ink shadow-overlay fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0'
            >
              <SlotDetails slot={slot} view={view} now={now} highlight={hovered} />
            </TooltipPrimitive.Content>
          </TooltipPrimitive.Portal>
        )}
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  )
}

function SegmentIcon({ status }: { status: SlotSegment['status'] }) {
  if (status === 'passed') return <Check className='size-3 text-ok' />
  if (status === 'failed') return <X className='size-3 text-breach' />
  if (status === 'skipped') return <Minus className='size-3 text-ink-4' />
  if (status === 'running')
    return <span className='size-2 animate-pulse rounded-full bg-ink' />
  if (status === 'waiting')
    return <span className='size-2 rounded-full bg-caution' />
  return <Circle className='size-2.5 text-ink-4' />
}

/** The hover card: the board, what is happening now, and every test. */
export function SlotDetails({
  slot,
  view,
  now,
  highlight,
}: {
  slot: QaSlotDto
  view: SlotView
  now: number
  highlight: QaBoardTestId | null
}) {
  const run = slot.run
  const chip = slot.unit?.chipUid ?? run?.chipUid ?? null
  const job = slot.activeJob
  const left = view.segments.length - view.passed - view.failed

  const now_ =
    view.phase === 'flashing'
      ? {
          tone: 'text-ink',
          title: `${view.headline}${job?.percent != null ? ` · ${job.percent}%` : ''}`,
          note: 'The board tests start when the board reboots.',
        }
      : view.phase === 'waiting' && view.current
        ? {
            tone: 'text-caution',
            title: `Step ${view.step?.index} of ${view.step?.of} · ${testLabel(view.current.id)}`,
            note: 'Waiting for you: pick up the board and press Start.',
          }
        : view.phase === 'testing' && view.current
          ? {
              tone: 'text-ink',
              title: `Step ${view.step?.index} of ${view.step?.of} · ${testLabel(view.current.id)}`,
              note: [
                view.current.progress ?? view.current.prompt,
                `running for ${elapsedSince(view.current.startedAt, now) ?? '0:00'}`,
              ]
                .filter(Boolean)
                .join(' · '),
            }
          : view.phase === 'failed'
            ? {
                tone: 'text-breach',
                title: view.headline,
                note:
                  view.segments.find((segment) => segment.status === 'failed')
                    ?.result?.error ?? 'Failed in an earlier run.',
              }
            : view.phase === 'passed'
              ? {
                  tone: 'text-ok',
                  title: `Passed all ${view.segments.length} tests`,
                  note: 'Board tests passed on the unit.',
                }
              : { tone: 'text-ink-2', title: view.headline, note: null }

  return (
    <div className='grid gap-2 text-xs'>
      <div className='flex items-baseline justify-between gap-2'>
        <span className='text-[13px] font-semibold'>{slot.label}</span>
        <span className='truncate font-mono text-[10px] text-ink-3'>
          {slot.portPath ?? 'adapter unplugged'}
        </span>
      </div>
      <dl className='grid grid-cols-[72px_minmax(0,1fr)] gap-x-2 gap-y-0.5 text-[11px]'>
        <dt className='text-ink-4'>Device ID</dt>
        <dd className='truncate font-mono text-ink-2'>
          {slot.unit?.imei ?? 'not read yet'}
        </dd>
        <dt className='text-ink-4'>Chip</dt>
        <dd className='truncate font-mono text-ink-2'>
          {chip ? formatChipUid(chip) : '—'}
        </dd>
        <dt className='text-ink-4'>Firmware</dt>
        <dd className='truncate font-mono text-ink-2'>
          {run?.firmwareVersion ?? '—'}
        </dd>
        <dt className='text-ink-4'>ST-LINK</dt>
        <dd className='truncate font-mono text-ink-2'>
          {slot.probeSerial ?? 'any'}
          {slot.probeShared ? ' · shared' : ''}
        </dd>
      </dl>
      <div className='rounded-md bg-white/[0.04] px-2.5 py-1.5'>
        <p className={cn('font-medium', now_.tone)}>{now_.title}</p>
        {now_.note ? (
          <p className='mt-0.5 text-[11px] text-ink-3'>{now_.note}</p>
        ) : null}
      </div>
      {view.phase === 'flashing' ? null : (
        <ul className='grid'>
          {view.segments.map((segment) => {
            const summary = segment.result
              ? segment.status === 'failed'
                ? (segment.result.error ?? summarizeResult(segment.result))
                : summarizeResult(segment.result)
              : null
            return (
              <li
                key={segment.id}
                className={cn(
                  'grid grid-cols-[14px_minmax(0,1fr)_auto] items-center gap-2 rounded px-1.5 py-[3px] text-ink-2',
                  highlight === segment.id && 'bg-white/[0.06] text-ink'
                )}
              >
                <span className='grid place-items-center'>
                  <SegmentIcon status={segment.status} />
                </span>
                <span className='truncate'>{testLabel(segment.id)}</span>
                <span className='max-w-[150px] truncate text-end text-[11px] text-ink-3'>
                  {segment.status === 'running'
                    ? 'running…'
                    : segment.status === 'waiting'
                      ? 'press Start'
                      : !segment.fromThisRun && segment.status !== 'pending'
                        ? 'earlier run'
                        : summary}
                </span>
              </li>
            )
          })}
        </ul>
      )}
      <div className='flex justify-between border-t border-line-faint pt-1.5 text-[11px] text-ink-3'>
        <span>
          {view.passed} passed · {view.failed} failed · {left} left
        </span>
        <span className='tabular'>
          {run ? elapsedSince(run.startedAt, now, run.finishedAt) : ''}
        </span>
      </div>
    </div>
  )
}
