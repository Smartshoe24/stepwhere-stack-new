import { useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type {
  QaFirmwareUploadDto,
  QaSlotDto,
  QaStationDto,
  QaStationSlotsDto,
} from '@stepwhere/types'
import { ClipboardCheck, Zap } from 'lucide-react'
import { toast } from 'sonner'
import { createQaBenchJob, sendQaSlotCommand } from '@/lib/api-client'
import { handleServerError } from '@/lib/handle-server-error'
import { cn } from '@/lib/utils'
import { Panel } from '@/components/patterns/panel'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { FirmwareChannelTag } from '@/features/qa-units/components/stage-display'
import { upsertQaJobInCache } from '../../lib/qa-bench-cache'
import { useNow } from '../../lib/use-now'
import {
  countSlotPhases,
  describeSlot,
  type SlotAction,
  type SlotPhase,
  type SlotView,
} from '../../lib/qa-slot-state'
import { SlotCard } from './slot-card'
import { SlotSheet } from './slot-sheet'

const COUNT_ORDER: { phase: SlotPhase; label: string; dot: string }[] = [
  { phase: 'testing', label: 'testing', dot: 'bg-ink-2' },
  { phase: 'flashing', label: 'flashing', dot: 'bg-ink-3' },
  { phase: 'waiting', label: 'waiting for you', dot: 'bg-caution' },
  { phase: 'passed', label: 'passed', dot: 'bg-ok' },
  { phase: 'failed', label: 'failed', dot: 'bg-breach' },
  { phase: 'stopped', label: 'stopped', dot: 'bg-ink-4' },
  { phase: 'empty', label: 'empty', dot: 'bg-ink-4' },
]

/** Slots that can flash at the same time: each has its own ST-LINK, plugged in and free. */
function flashableSlots(slots: QaSlotDto[], views: Map<string, SlotView>) {
  return slots.filter((slot) => {
    const phase = views.get(slot.id)?.phase
    return (
      slot.probeSerial &&
      slot.probePresent &&
      !slot.probeShared &&
      !slot.activeJob &&
      phase !== 'testing' &&
      phase !== 'waiting'
    )
  })
}

export function SlotBench({
  station,
  data,
  firmwareUploads,
}: {
  station: QaStationDto
  data: QaStationSlotsDto
  firmwareUploads: QaFirmwareUploadDto[]
}) {
  const queryClient = useQueryClient()
  const now = useNow()
  const [openSlotId, setOpenSlotId] = useState<string | null>(null)
  const [pickedFirmwareId, setFirmwareId] = useState<string | null>(null)
  const online = station.connection === 'online'

  // The newest QA build by default: a bench of slots runs board tests.
  const firmwareId =
    pickedFirmwareId ??
    firmwareUploads.find((upload) => upload.channel === 'qa')?.id ??
    firmwareUploads[0]?.id ??
    null
  const firmware = firmwareUploads.find((upload) => upload.id === firmwareId) ?? null

  const views = useMemo(
    () => new Map(data.slots.map((slot) => [slot.id, describeSlot(slot)])),
    [data.slots]
  )
  const counts = countSlotPhases([...views.values()])
  const needsYou = data.slots
    .map((slot) => ({ slot, view: views.get(slot.id)! }))
    .filter((entry) => entry.view.needsYou)
    // Start prompts first: those boards are idle until someone gets there.
    .sort((a, b) => Number(b.view.phase === 'waiting') - Number(a.view.phase === 'waiting'))
  const flashable = flashableSlots(data.slots, views)
  // Boards that never ran or stopped early. Passed and failed boards have their result already.
  const testable = data.slots.filter((slot) => {
    const phase = views.get(slot.id)?.phase
    return slot.portOpen && (phase === 'empty' || phase === 'stopped')
  })

  const commandMutation = useMutation({
    mutationFn: ({ slotIds, command }: { slotIds?: string[]; command: string }) =>
      sendQaSlotCommand(station.id, { slotIds, data: `${command}\r\n` }),
    onSuccess: (result, input) => {
      if (input.slotIds && input.slotIds.length > 1) {
        toast.success(`Sent to ${result.sentTo.length} slot${result.sentTo.length === 1 ? '' : 's'}.`)
      }
      if (result.sentTo.length === 0) toast.error('No slot with an open port to send to.')
    },
    onError: handleServerError,
  })
  const runAction = (slot: QaSlotDto, action: SlotAction) =>
    commandMutation.mutate({ slotIds: [slot.id], command: action.command })

  const flashMutation = useMutation({
    mutationFn: async (slots: QaSlotDto[]) => {
      if (!firmware) throw new Error('Choose firmware first.')
      const results = await Promise.allSettled(
        slots.map((slot) =>
          createQaBenchJob(station.id, {
            kind: 'flash',
            probeSerial: slot.probeSerial,
            connectMode: 'normal',
            firmwareId: firmware.id,
            slotId: slot.id,
          })
        )
      )
      for (const result of results) {
        if (result.status === 'fulfilled') upsertQaJobInCache(queryClient, result.value)
      }
      const failed = results.find((result) => result.status === 'rejected')
      if (failed?.status === 'rejected') throw failed.reason
      return results.length
    },
    onSuccess: (started) =>
      toast.success(`Flashing ${started} slot${started === 1 ? '' : 's'}.`),
    onError: handleServerError,
  })

  const openSlot = data.slots.find((slot) => slot.id === openSlotId) ?? null

  return (
    <div className='grid gap-4'>
      <Panel bodyClassName='grid gap-4'>
        <div className='flex flex-wrap items-center gap-2'>
          <Select
            value={firmwareId ?? undefined}
            onValueChange={setFirmwareId}
            disabled={firmwareUploads.length === 0}
          >
            <SelectTrigger className='w-72 max-w-full' aria-label='Firmware to flash'>
              <SelectValue placeholder='Upload firmware in the single-board view' />
            </SelectTrigger>
            <SelectContent>
              {firmwareUploads.map((upload) => (
                <SelectItem key={upload.id} value={upload.id}>
                  <FirmwareChannelTag channel={upload.channel} />
                  <span className='font-mono text-xs'>
                    {upload.version ? `${upload.version} · ` : ''}
                    {upload.fileName}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            disabled={!online || !firmware || flashable.length === 0 || flashMutation.isPending}
            title={
              flashable.length === 0
                ? 'Flashing several slots at once needs an ST-LINK for each. With a shared ST-LINK, flash from the slot it is clipped onto.'
                : undefined
            }
            onClick={() => flashMutation.mutate(flashable)}
          >
            <Zap />
            {flashable.length
              ? `Flash ${flashable.length} slot${flashable.length === 1 ? '' : 's'}`
              : 'Flash slots'}
          </Button>
          <Button
            variant='outline'
            disabled={!online || testable.length === 0 || commandMutation.isPending}
            onClick={() =>
              commandMutation.mutate({
                slotIds: testable.map((slot) => slot.id),
                command: 'QA RUN',
              })
            }
          >
            <ClipboardCheck />
            Run tests on {testable.length} idle
          </Button>
        </div>

        <div className='flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-3'>
          {COUNT_ORDER.filter((entry) => counts[entry.phase] > 0 || entry.phase !== 'stopped').map(
            (entry) => (
              <span key={entry.phase} className='inline-flex items-center gap-1.5'>
                <span className={cn('size-1.5 rounded-full', entry.dot)} />
                <b className='font-semibold text-ink tabular'>{counts[entry.phase]}</b>
                {entry.label}
              </span>
            )
          )}
        </div>

        {needsYou.length > 0 ? (
          <div className='rounded-md bg-canvas px-3 py-1 shadow-[inset_0_0_0_1px_var(--line-faint)]'>
            <p className='py-1.5 text-xs font-semibold text-ink-2'>
              Needs you · {needsYou.length}
            </p>
            <ul className='grid border-t border-line-faint xl:grid-cols-2 xl:gap-x-6 [&>li]:border-b [&>li]:border-line-faint [&>li:last-child]:border-b-0 xl:[&>li:nth-last-child(2):nth-child(odd)]:border-b-0'>
              {needsYou.map(({ slot, view }) => (
                <li
                  key={slot.id}
                  className='grid grid-cols-[3px_64px_minmax(0,1fr)_auto] items-center gap-3 py-1.5 text-xs'
                >
                  <span
                    className={cn(
                      'h-4 rounded-full',
                      view.phase === 'failed' ? 'bg-breach' : 'bg-caution'
                    )}
                  />
                  <button
                    type='button'
                    className='focus-trail truncate text-start font-medium text-ink-2 hover:text-ink'
                    onClick={() => setOpenSlotId(slot.id)}
                  >
                    {slot.label}
                  </button>
                  <span className='truncate text-ink-3'>{view.needsYou?.text}</span>
                  {view.needsYou?.action ? (
                    <Button
                      size='sm'
                      variant={view.phase === 'waiting' ? 'default' : 'outline'}
                      className='h-6 text-[11px]'
                      disabled={!slot.portOpen || commandMutation.isPending}
                      onClick={() => runAction(slot, view.needsYou!.action!)}
                    >
                      {view.needsYou.action.label}
                    </Button>
                  ) : (
                    <span />
                  )}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className='grid grid-cols-[repeat(auto-fill,minmax(176px,1fr))] gap-2'>
          {data.slots.map((slot) => (
            <SlotCard
              key={slot.id}
              slot={slot}
              view={views.get(slot.id)!}
              now={now}
              onOpen={() => setOpenSlotId(slot.id)}
              onAction={(action) => runAction(slot, action)}
              actionPending={commandMutation.isPending}
            />
          ))}
        </div>

        <SlotLegend />
      </Panel>

      <SlotSheet
        station={station}
        slot={openSlot}
        view={openSlot ? views.get(openSlot.id)! : null}
        now={now}
        firmware={firmware}
        onClose={() => setOpenSlotId(null)}
      />
    </div>
  )
}

function SlotLegend() {
  const item = (swatch: string, label: string) => (
    <span className='inline-flex items-center gap-1.5'>
      <span className={cn('h-1.5 w-3.5 rounded-[2px]', swatch)} />
      {label}
    </span>
  )
  return (
    <div className='flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-ink-3'>
      {item('bg-ok/70', 'passed')}
      {item('bg-ink-2', 'running now')}
      {item('bg-caution', 'waiting for you')}
      {item('bg-breach', 'failed')}
      {item(
        'bg-[repeating-linear-gradient(135deg,var(--ink-4)_0_2px,transparent_2px_4px)]',
        'skipped'
      )}
      {item('bg-white/[0.07]', 'not yet')}
      <span className='text-ink-4'>Faded: from an earlier run</span>
    </div>
  )
}
