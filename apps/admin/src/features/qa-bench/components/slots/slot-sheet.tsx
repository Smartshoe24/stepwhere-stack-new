import { Link } from '@tanstack/react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  QA_TTL_START_COMMAND,
  type QaBoardTestId,
  type QaFirmwareUploadDto,
  type QaSlotDto,
  type QaStationDto,
} from '@stepwhere/types'
import { ClipboardCheck, Square, Zap } from 'lucide-react'
import { cancelQaBenchJob, createQaBenchJob, sendQaSlotCommand } from '@/lib/api-client'
import { handleServerError } from '@/lib/handle-server-error'
import { StatusBadge } from '@/features/admin/components/status-badge'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { TestChecklist } from '@/features/qa-units/components/test-checklist'
import { formatChipUid } from '@/features/qa-units/lib/qa-unit-format'
import { upsertQaJobInCache } from '../../lib/qa-bench-cache'
import { elapsedSince, type SlotView } from '../../lib/qa-slot-state'
import { RemainingTests } from '../board-tests-panel'
import { SerialConsolePanel } from '../serial-console'

const phaseBadge: Record<
  SlotView['phase'],
  { tone: 'info' | 'success' | 'danger' | 'warning' | 'muted'; label: string }
> = {
  empty: { tone: 'muted', label: 'Empty' },
  flashing: { tone: 'info', label: 'Flashing' },
  testing: { tone: 'info', label: 'Testing' },
  waiting: { tone: 'warning', label: 'Waiting for you' },
  passed: { tone: 'success', label: 'Passed' },
  failed: { tone: 'danger', label: 'Failed' },
  stopped: { tone: 'muted', label: 'Stopped' },
}

/** One slot up close: the board, its checklist, flash and test controls, and its serial console. */
export function SlotSheet({
  station,
  slot,
  view,
  now,
  firmware,
  onClose,
}: {
  station: QaStationDto
  slot: QaSlotDto | null
  view: SlotView | null
  now: number
  firmware: QaFirmwareUploadDto | null
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const online = station.connection === 'online'

  const commandMutation = useMutation({
    mutationFn: (command: string) =>
      sendQaSlotCommand(station.id, {
        slotIds: slot ? [slot.id] : [],
        data: `${command}\r\n`,
      }),
    onError: handleServerError,
  })
  const flashMutation = useMutation({
    mutationFn: () => {
      if (!slot || !firmware) throw new Error('Choose firmware first.')
      return createQaBenchJob(station.id, {
        kind: 'flash',
        probeSerial: slot.probeSerial,
        connectMode: 'normal',
        firmwareId: firmware.id,
        slotId: slot.id,
      })
    },
    onSuccess: (job) => upsertQaJobInCache(queryClient, job),
    onError: handleServerError,
  })
  const cancelMutation = useMutation({
    mutationFn: (jobId: string) => cancelQaBenchJob(jobId),
    onSuccess: (job) => upsertQaJobInCache(queryClient, job),
    onError: handleServerError,
  })

  const run = slot?.run ?? null
  const running = run?.status === 'running'
  const busy = commandMutation.isPending || !slot?.portOpen
  const chip = slot?.unit?.chipUid ?? run?.chipUid ?? null
  const unitId = slot?.unit?.id ?? run?.unitId ?? null

  return (
    <Sheet open={!!slot} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className='w-full gap-0 overflow-y-auto sm:max-w-xl'>
        {slot && view ? (
          <>
            <SheetHeader className='border-b border-line-faint pe-12'>
              <div className='flex items-center gap-2'>
                <SheetTitle>{slot.label}</SheetTitle>
                <StatusBadge tone={phaseBadge[view.phase].tone}>
                  {phaseBadge[view.phase].label}
                </StatusBadge>
              </div>
              <SheetDescription className='grid gap-0.5 text-xs'>
                <span>
                  {slot.unit?.imei ? (
                    <>
                      IMEI <span className='font-mono text-ink-2'>{slot.unit.imei}</span>
                    </>
                  ) : chip ? (
                    <>
                      Chip <span className='font-mono text-ink-2'>{formatChipUid(chip)}</span>
                    </>
                  ) : (
                    'No board read yet'
                  )}
                  {unitId ? (
                    <>
                      {' · '}
                      <Link
                        to='/qa/units/$unitId'
                        params={{ unitId }}
                        className='text-act hover:text-act-hover'
                      >
                        Open unit
                      </Link>
                    </>
                  ) : null}
                </span>
                <span className='font-mono'>
                  {slot.portPath ?? 'TTL adapter unplugged'}
                  {' · '}
                  {slot.probeSerial
                    ? `ST-LINK ${slot.probeSerial}${slot.probePresent ? '' : ' (not plugged in)'}${slot.probeShared ? ' · shared' : ''}`
                    : 'any ST-LINK'}
                </span>
              </SheetDescription>
            </SheetHeader>

            <div className='grid grid-cols-[minmax(0,1fr)] gap-4 p-4'>
              <div className='flex flex-wrap items-center gap-2'>
                {slot.activeJob ? (
                  <Button
                    variant='outline'
                    disabled={cancelMutation.isPending}
                    onClick={() => cancelMutation.mutate(slot.activeJob!.id)}
                  >
                    <Square />
                    Cancel flash · {slot.activeJob.percent ?? 0}%
                  </Button>
                ) : (
                  <Button
                    variant='outline'
                    disabled={!online || !firmware || flashMutation.isPending || running}
                    title={
                      slot.probeShared
                        ? 'Clip the shared ST-LINK onto this board first.'
                        : undefined
                    }
                    onClick={() => flashMutation.mutate()}
                  >
                    <Zap />
                    Flash {firmware?.version ?? firmware?.fileName ?? ''}
                  </Button>
                )}
                {running ? (
                  <Button
                    variant='outline'
                    disabled={busy}
                    onClick={() => commandMutation.mutate('QA ABORT')}
                  >
                    <Square />
                    Abort tests
                  </Button>
                ) : (
                  <Button
                    disabled={busy}
                    onClick={() => commandMutation.mutate('QA RUN')}
                  >
                    <ClipboardCheck />
                    Run board tests
                  </Button>
                )}
                {run ? (
                  <span className='ms-auto text-xs text-ink-3 tabular'>
                    Run {run.runNumber} · {run.firmwareVersion} ·{' '}
                    {elapsedSince(run.startedAt, now, run.finishedAt)}
                  </span>
                ) : null}
              </div>

              {!slot.portOpen ? (
                <p className='text-xs text-caution'>
                  {slot.portPath
                    ? 'The TTL port is not open yet. The agent opens slot ports on its own; check the console below for errors.'
                    : 'The TTL adapter for this slot is unplugged.'}
                </p>
              ) : null}

              {run ? (
                <div className='grid gap-3'>
                  <TestChecklist
                    results={run.results}
                    onRetry={running ? undefined : (id: QaBoardTestId) => commandMutation.mutate(`QA RUN ${id}`)}
                    retryDisabled={busy}
                    onStart={() => commandMutation.mutate(QA_TTL_START_COMMAND)}
                  />
                  {!running && slot.verdict ? (
                    <RemainingTests
                      shown={run.results.map((result) => result.id)}
                      verdict={slot.verdict}
                      onRetry={(id) => commandMutation.mutate(`QA RUN ${id}`)}
                      disabled={busy}
                    />
                  ) : null}
                </div>
              ) : (
                <p className='text-sm text-ink-3'>
                  Flash the QA firmware, or press Run board tests if the board
                  already has it.
                </p>
              )}

              <SerialConsolePanel
                key={`${slot.id}:${slot.portPath ?? ''}`}
                station={station}
                fixedPath={slot.portPath}
                height={260}
              />
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}
