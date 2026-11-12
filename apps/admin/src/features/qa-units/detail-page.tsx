import { useMemo, useState } from 'react'
import { getRouteApi, Link } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  QaBenchJobDto,
  QaTestRunDto,
  QaUnitDetailDto,
  QaUnitEventDto,
  QaUnitEventKind,
} from '@stepwhere/types'
import { format, isToday } from 'date-fns'
import { Cpu, Pencil, Wrench } from 'lucide-react'
import { toast } from 'sonner'
import { addQaUnitNote, getQaUnit } from '@/lib/api-client'
import { formatAdminDateTime } from '@/lib/date-format'
import { handleServerError } from '@/lib/handle-server-error'
import { cn } from '@/lib/utils'
import { adminQueryKeys } from '@/features/admin/query-keys'
import { AdminLastSeen } from '@/features/admin/components/admin-last-seen'
import { RecordPageHeader } from '@/features/admin/components/record-page-header'
import { RecordStat } from '@/features/admin/components/record-stat'
import {
  DeviceStatusBadge,
  StatusBadge,
} from '@/features/admin/components/status-badge'
import { Main } from '@/components/layout/main'
import { EventTable, EventTableEmpty } from '@/components/patterns/event-table'
import { KeyValue, KeyValueList } from '@/components/patterns/key-value'
import { MetaRow } from '@/components/patterns/page-header'
import { Panel } from '@/components/patterns/panel'
import { EmptyState } from '@/components/patterns/states'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import {
  formatDuration,
  qaJobStatusLabel,
  qaJobStatusTone,
} from '@/features/qa-bench/lib/qa-bench-format'
import {
  FirmwareChannelBadge,
  StageStepper,
  UnitStatusBadge,
} from './components/stage-display'
import {
  EditImeiDialog,
  SetStageDialog,
  type StagePreset,
} from './components/unit-dialogs'
import { TestChecklist } from './components/test-checklist'
import { runStatusLabel, runStatusTone } from './lib/qa-test-format'
import {
  formatChipUid,
  manualStages,
  nextStage,
  stageIndex,
  stageLabels,
  stageTimes,
  unitTitle,
} from './lib/qa-unit-format'

const route = getRouteApi('/_authenticated/qa/units/$unitId')

function formatStepTime(value: string) {
  const date = new Date(value)
  return isToday(date) ? format(date, 'HH:mm') : format(date, 'dd MMM')
}

export function QaUnitDetailPage() {
  const { unitId } = route.useParams()
  const [stagePreset, setStagePreset] = useState<StagePreset | null>(null)
  const [editingImei, setEditingImei] = useState(false)

  const unitQuery = useQuery({
    queryKey: adminQueryKeys.qa.unit(unitId),
    queryFn: () => getQaUnit(unitId),
  })
  const unit = unitQuery.data
  const times = useMemo(() => stageTimes(unit?.events ?? []), [unit?.events])

  if (unitQuery.isError && !unit) {
    return (
      <Main>
        <RecordPageHeader backTo='/qa/units' title='Unit' />
        <Panel>
          <EmptyState
            title='Unit not found'
            description='It may have been removed, or the link is wrong.'
          />
        </Panel>
      </Main>
    )
  }

  return (
    <>
      <Main>
        <RecordPageHeader
          backTo='/qa/units'
          title={
            <span className='font-mono'>{unit ? unitTitle(unit) : 'Unit'}</span>
          }
          icon={<Cpu />}
          meta={unit ? <UnitStatusBadge unit={unit} /> : null}
          description={
            unit ? (
              <MetaRow>
                {[
                  <span key='chip' className='font-mono'>
                    chip {formatChipUid(unit.chipUid)}
                  </span>,
                  <span key='fw'>
                    {unit.firmwareFileName
                      ? `fw ${unit.firmwareVersion ?? unit.firmwareFileName}`
                      : 'Not flashed'}
                  </span>,
                  <span key='created'>
                    First seen {formatAdminDateTime(unit.createdAt)}
                  </span>,
                ]}
              </MetaRow>
            ) : (
              'Stages, timeline and bench jobs for one board.'
            )
          }
          onRefresh={() => void unitQuery.refetch()}
          refreshing={unitQuery.isFetching}
          actions={
            unit ? (
              <>
                <Button
                  variant='outline'
                  onClick={() =>
                    setStagePreset({
                      stage: unit.stage,
                      status: unit.stageStatus,
                      title: 'Set stage',
                    })
                  }
                >
                  <Pencil />
                  Set stage
                </Button>
                <Button asChild>
                  <Link
                    to='/qa/bench'
                    search={{ station: unit.lastStationId ?? undefined }}
                  >
                    <Wrench />
                    Open bench
                  </Link>
                </Button>
              </>
            ) : null
          }
        />

        {unit ? (
          <>
            <Panel
              title='Production line'
              actions={
                <NextStepActions unit={unit} onPreset={setStagePreset} />
              }
            >
              <StageStepper
                unit={unit}
                times={times}
                formatTime={formatStepTime}
              />
            </Panel>

            <div className='grid gap-3 sm:grid-cols-2 xl:grid-cols-4'>
              <RecordStat
                label='Stage'
                value={
                  <span>
                    {stageLabels[unit.stage]}
                    <span className='ms-2 text-xs font-normal text-ink-3'>
                      {stageIndex(unit.stage) + 1} of 10
                    </span>
                  </span>
                }
              />
              <RecordStat
                label='Firmware'
                value={
                  unit.firmware ? (
                    <span className='flex min-w-0 items-center gap-2'>
                      <span className='truncate font-mono text-xs'>
                        {unit.firmware.version ?? unit.firmware.fileName}
                      </span>
                      <FirmwareChannelBadge channel={unit.firmware.channel} />
                    </span>
                  ) : (
                    <span className='text-ink-3'>Not flashed yet</span>
                  )
                }
              />
              <RecordStat
                label='IMEI'
                value={
                  unit.imei ? (
                    <button
                      type='button'
                      className='focus-trail rounded-xs font-mono text-xs hover:text-act'
                      onClick={() => setEditingImei(true)}
                    >
                      {unit.imei}
                    </button>
                  ) : (
                    <Button variant='link' onClick={() => setEditingImei(true)}>
                      Enter IMEI
                    </Button>
                  )
                }
              />
              <RecordStat
                label='Device record'
                value={
                  unit.device ? (
                    <Link
                      to='/devices/$deviceId'
                      params={{ deviceId: unit.device.id }}
                      className='focus-trail flex items-center gap-2 rounded-xs text-act hover:text-act-hover'
                    >
                      Devices ›
                      <DeviceStatusBadge status={unit.device.status} />
                    </Link>
                  ) : (
                    <span className='text-ink-3'>
                      Created when the IMEI is known
                    </span>
                  )
                }
              />
            </div>

            <div className='grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_340px]'>
              <Tabs defaultValue='timeline' className='min-w-0'>
                <TabsList>
                  <TabsTrigger value='timeline'>Timeline</TabsTrigger>
                  <TabsTrigger value='tests'>
                    Board tests
                    <span className='ms-1.5 text-2xs text-ink-3 tabular'>
                      {unit.testRuns.length}
                    </span>
                  </TabsTrigger>
                  <TabsTrigger value='jobs'>
                    Bench jobs
                    <span className='ms-1.5 text-2xs text-ink-3 tabular'>
                      {unit.jobs.length}
                    </span>
                  </TabsTrigger>
                </TabsList>
                <TabsContent value='timeline'>
                  <Panel>
                    <NoteComposer unitId={unit.id} />
                    <Timeline events={unit.events} />
                  </Panel>
                </TabsContent>
                <TabsContent value='tests'>
                  <TestRuns runs={unit.testRuns} />
                </TabsContent>
                <TabsContent value='jobs'>
                  <Panel>
                    <JobsTable jobs={unit.jobs} />
                  </Panel>
                </TabsContent>
              </Tabs>

              <div className='grid min-w-0 gap-4'>
                <Panel title='Identity'>
                  <KeyValueList>
                    <KeyValue
                      label='Chip UID'
                      value={formatChipUid(unit.chipUid)}
                      mono
                    />
                    <KeyValue
                      label='IMEI'
                      value={
                        <span className='flex items-center gap-2'>
                          <span className='font-mono text-xs'>
                            {unit.imei ?? (
                              <span className='font-sans text-ink-3'>
                                Not read yet
                              </span>
                            )}
                          </span>
                          <Button
                            variant='ghost'
                            size='sm'
                            onClick={() => setEditingImei(true)}
                          >
                            {unit.imei ? 'Change' : 'Enter'}
                          </Button>
                        </span>
                      }
                    />
                    <KeyValue
                      label='Customer binding'
                      value={
                        unit.device ? (
                          unit.device.bound ? (
                            <StatusBadge tone='success'>Bound</StatusBadge>
                          ) : (
                            <StatusBadge tone='muted'>Not bound</StatusBadge>
                          )
                        ) : null
                      }
                    />
                  </KeyValueList>
                </Panel>
                <Panel title='Where it is'>
                  <KeyValueList>
                    <KeyValue label='Station' value={unit.lastStationName} />
                    <KeyValue
                      label='Last telemetry'
                      value={
                        unit.device?.lastSeenAt ? (
                          <AdminLastSeen value={unit.device.lastSeenAt} />
                        ) : null
                      }
                    />
                    <KeyValue
                      label='Updated'
                      value={<AdminLastSeen value={unit.updatedAt} />}
                    />
                  </KeyValueList>
                </Panel>
              </div>
            </div>
          </>
        ) : null}
      </Main>

      {unit && stagePreset ? (
        <SetStageDialog
          key={`${stagePreset.stage}-${stagePreset.status}-${stagePreset.title}`}
          unit={unit}
          preset={stagePreset}
          onClose={() => setStagePreset(null)}
        />
      ) : null}
      {unit && editingImei ? (
        <EditImeiDialog unit={unit} onClose={() => setEditingImei(false)} />
      ) : null}
    </>
  )
}

/** What the operator does next: flash on the Bench, or pass/fail a manual stage. */
function NextStepActions({
  unit,
  onPreset,
}: {
  unit: QaUnitDetailDto
  onPreset: (preset: StagePreset) => void
}) {
  if (unit.stageStatus === 'scrapped') {
    return <span className='text-xs text-ink-3'>Scrapped</span>
  }

  if (unit.stageStatus === 'failed') {
    return (
      <Button
        size='sm'
        variant='outline'
        onClick={() =>
          onPreset({
            stage: unit.stage,
            status: 'pending',
            title: 'Send to rework',
          })
        }
      >
        Send to rework
      </Button>
    )
  }

  const target =
    unit.stageStatus === 'passed' ? nextStage(unit.stage) : unit.stage

  if (!target) {
    return <span className='text-xs text-ink-3'>All stages done</span>
  }

  if (target === 'qa_firmware' || target === 'production_firmware') {
    return (
      <span className='text-xs text-ink-3'>
        Next: flash {target === 'qa_firmware' ? 'QA' : 'production'} firmware on
        the Bench
      </span>
    )
  }

  if (!manualStages.includes(target)) {
    return null
  }

  return (
    <div className='flex items-center gap-2'>
      <span className='text-xs text-ink-3'>{stageLabels[target]}</span>
      <Button
        size='sm'
        variant='destructive'
        onClick={() =>
          onPreset({
            stage: target,
            status: 'failed',
            title: `${stageLabels[target]} failed`,
          })
        }
      >
        Fail
      </Button>
      <Button
        size='sm'
        onClick={() =>
          onPreset({
            stage: target,
            status: 'passed',
            title: `${stageLabels[target]} passed`,
          })
        }
      >
        Pass
      </Button>
    </div>
  )
}

function NoteComposer({ unitId }: { unitId: string }) {
  const queryClient = useQueryClient()
  const [note, setNote] = useState('')
  const mutation = useMutation({
    mutationFn: () => addQaUnitNote(unitId, note),
    onSuccess: (unit) => {
      queryClient.setQueryData(adminQueryKeys.qa.unit(unitId), unit)
      setNote('')
      toast.success('Note added.')
    },
    onError: handleServerError,
  })

  return (
    <div className='mb-5 flex items-start gap-2'>
      <Textarea
        value={note}
        rows={1}
        maxLength={2000}
        placeholder='Add a note, e.g. reseated the GPS antenna'
        className='min-h-9'
        onChange={(event) => setNote(event.target.value)}
        onKeyDown={(event) => {
          if (
            event.key === 'Enter' &&
            (event.metaKey || event.ctrlKey) &&
            note.trim()
          ) {
            mutation.mutate()
          }
        }}
      />
      <Button
        variant='outline'
        disabled={!note.trim() || mutation.isPending}
        onClick={() => mutation.mutate()}
      >
        Add
      </Button>
    </div>
  )
}

const eventDot: Record<QaUnitEventKind, string> = {
  registered: 'bg-info',
  identified: 'bg-ink-4',
  flashed: 'bg-ok',
  flash_failed: 'bg-breach',
  imei_linked: 'bg-info',
  imei_conflict: 'bg-caution',
  stage_changed: 'bg-ink-3',
  test_run: 'bg-ink-3',
  note: 'bg-act',
}

function eventTone(event: QaUnitEventDto) {
  if (event.kind === 'stage_changed' || event.kind === 'test_run') {
    if (event.stageStatus === 'failed') return 'bg-breach'
    if (event.stageStatus === 'passed') return 'bg-ok'
    if (event.stageStatus === 'scrapped') return 'bg-ink-4'
    return 'bg-caution'
  }
  return eventDot[event.kind]
}

function Timeline({ events }: { events: QaUnitEventDto[] }) {
  if (events.length === 0) {
    return <p className='text-sm text-ink-3'>Nothing recorded yet.</p>
  }

  return (
    <ol className='relative grid gap-5 ps-5 before:absolute before:start-[3px] before:top-1.5 before:bottom-1.5 before:w-px before:bg-line-faint'>
      {events.map((event) => (
        <li key={event.id} className='relative'>
          <span
            aria-hidden='true'
            className={cn(
              'absolute -start-5 top-1.5 size-[7px] rounded-full',
              eventTone(event)
            )}
          />
          <div className='flex items-start justify-between gap-4'>
            <p
              className={cn(
                'text-sm',
                event.kind === 'note' ? 'text-ink-2' : 'text-ink'
              )}
            >
              {event.message}
            </p>
            <time
              className='shrink-0 text-xs text-ink-4 tabular'
              dateTime={event.createdAt}
              title={formatAdminDateTime(event.createdAt)}
            >
              {formatStepTime(event.createdAt)}
            </time>
          </div>
          {event.stationName || event.actorName ? (
            <p className='mt-0.5 text-xs text-ink-3'>
              {[event.stationName, event.actorName].filter(Boolean).join(' · ')}
            </p>
          ) : null}
        </li>
      ))}
    </ol>
  )
}

function TestRuns({ runs }: { runs: QaTestRunDto[] }) {
  if (runs.length === 0) {
    return (
      <Panel>
        <EmptyState
          compact
          title='No board tests yet'
          description='Flash a QA firmware build on the Bench with the serial console open. The tests run at boot and land here.'
        />
      </Panel>
    )
  }

  return (
    <div className='grid gap-3'>
      {runs.map((run, index) => (
        <details
          key={run.id}
          open={index === 0}
          className='group rounded-lg bg-raised shadow-[inset_0_0_0_1px_var(--line-faint)]'
        >
          <summary className='flex cursor-pointer list-none items-center gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden'>
            <StatusBadge tone={runStatusTone[run.status]}>
              {runStatusLabel[run.status]}
            </StatusBadge>
            <span className='text-sm text-ink tabular'>
              {run.passed}/{run.results.length} passed
              {run.failed ? (
                <span className='text-breach'> · {run.failed} failed</span>
              ) : null}
            </span>
            <span className='min-w-0 flex-1 truncate text-xs text-ink-3'>
              <span className='font-mono'>{run.firmwareVersion}</span>
              {run.stationName ? ` · ${run.stationName}` : ''}
            </span>
            <time
              className='shrink-0 text-xs text-ink-4 tabular'
              dateTime={run.startedAt}
            >
              {formatAdminDateTime(run.startedAt)}
            </time>
          </summary>
          <div className='border-t border-line-faint px-4 pb-2'>
            <TestChecklist results={run.results} />
          </div>
        </details>
      ))}
    </div>
  )
}

function JobsTable({ jobs }: { jobs: QaBenchJobDto[] }) {
  return (
    <EventTable>
      <thead>
        <tr>
          <th>Job</th>
          <th>Status</th>
          <th>Firmware</th>
          <th>Started</th>
          <th>Took</th>
        </tr>
      </thead>
      <tbody>
        {jobs.length === 0 ? (
          <EventTableEmpty colSpan={5}>No bench jobs yet.</EventTableEmpty>
        ) : (
          jobs.map((job) => (
            <tr key={job.id}>
              <td className='capitalize'>{job.kind}</td>
              <td>
                <StatusBadge tone={qaJobStatusTone[job.status]}>
                  {qaJobStatusLabel[job.status]}
                </StatusBadge>
              </td>
              <td className='font-mono text-xs'>
                {job.firmware
                  ? (job.firmware.version ?? job.firmware.fileName)
                  : '—'}
              </td>
              <td className='text-xs tabular'>
                {formatAdminDateTime(job.startedAt ?? job.createdAt)}
              </td>
              <td className='text-xs tabular'>
                {job.result ? formatDuration(job.result.durationMs) : '—'}
              </td>
            </tr>
          ))
        )}
      </tbody>
    </EventTable>
  )
}
