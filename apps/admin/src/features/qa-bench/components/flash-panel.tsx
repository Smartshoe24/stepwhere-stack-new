import { useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  QA_DEFAULT_FLASH_ADDRESS,
  type QaBenchJobDto,
  type QaConnectMode,
  type QaFirmwareChannel,
  type QaFirmwareUploadDto,
  type QaStationDto,
} from '@stepwhere/types'
import { Ban, Check, Cpu, FileUp, X, Zap } from 'lucide-react'
import { toast } from 'sonner'
import {
  cancelQaBenchJob,
  createQaBenchJob,
  createQaFirmwareUpload,
  getQaBenchJobLog,
} from '@/lib/api-client'
import { handleServerError } from '@/lib/handle-server-error'
import { cn } from '@/lib/utils'
import { formatAdminDateTime } from '@/lib/date-format'
import { adminQueryKeys } from '@/features/admin/query-keys'
import { StatusBadge } from '@/features/admin/components/status-badge'
import { FormField } from '@/components/patterns/key-value'
import { LiveBadge } from '@/components/patterns/live'
import { Panel } from '@/components/patterns/panel'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { upsertQaJobInCache } from '../lib/qa-bench-cache'
import { useQaBenchEvents } from '../lib/qa-bench-events'
import {
  QA_CONNECT_MODES,
  QA_FLASH_PHASES,
  describeQaJob,
  formatBytes,
  formatDuration,
  formatUid,
  isQaJobActive,
  qaJobStatusLabel,
  qaJobStatusTone,
  readFirmwareFile,
  shortSha,
  toneForProgrammerLine,
} from '../lib/qa-bench-format'
import { FirmwareChannelTag } from '@/features/qa-units/components/stage-display'
import { LogConsole, type ConsoleLine } from './log-console'
import { UploadFirmwareDialog } from './upload-firmware-dialog'

const FIRST_PROBE = '__first__'
const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{1,8}$/

export function FlashPanel({
  station,
  firmwareUploads,
  shownJob,
}: {
  station: QaStationDto
  firmwareUploads: QaFirmwareUploadDto[]
  /** The station's active job, or the job picked in Recent jobs. */
  shownJob: QaBenchJobDto | null
}) {
  const queryClient = useQueryClient()
  const fileInput = useRef<HTMLInputElement>(null)
  const [pickedFirmwareId, setFirmwareId] = useState<string | null>(null)
  const [pickedProbe, setProbe] = useState<string>(FIRST_PROBE)
  const [connectMode, setConnectMode] = useState<QaConnectMode>('normal')
  const [address, setAddress] = useState(QA_DEFAULT_FLASH_ADDRESS)

  const probes = useMemo(
    () => station.hardware?.probes ?? [],
    [station.hardware?.probes]
  )
  const online = station.connection === 'online'
  const programmerReady = station.agent?.programmer.found ?? false
  const busy = !!station.activeJobId
  // Default to the newest upload, and fall back to "first probe" when a picked probe is unplugged.
  const firmwareId = pickedFirmwareId ?? firmwareUploads[0]?.id ?? null
  const firmware =
    firmwareUploads.find((upload) => upload.id === firmwareId) ?? null
  const probe = probes.some((entry) => entry.serial === pickedProbe)
    ? pickedProbe
    : FIRST_PROBE

  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const uploadMutation = useMutation({
    mutationFn: async ({
      file,
      channel,
      version,
    }: {
      file: File
      channel: QaFirmwareChannel
      version: string
    }) =>
      createQaFirmwareUpload({
        ...(await readFirmwareFile(file)),
        channel,
        version: version || null,
      }),
    onSuccess: (upload) => {
      setPendingFile(null)
      queryClient.setQueryData<QaFirmwareUploadDto[]>(
        adminQueryKeys.qa.firmwareUploads(),
        (uploads) => [
          upload,
          ...(uploads ?? []).filter((entry) => entry.id !== upload.id),
        ]
      )
      setFirmwareId(upload.id)
      toast.success(`${upload.fileName} uploaded.`)
    },
    onError: (error) =>
      error instanceof Error && !('status' in error)
        ? toast.error(error.message)
        : handleServerError(error),
  })

  const jobMutation = useMutation({
    mutationFn: (kind: 'identify' | 'flash') => {
      const probeSerial = probe === FIRST_PROBE ? null : probe
      if (kind === 'identify') {
        return createQaBenchJob(station.id, { kind, probeSerial, connectMode })
      }
      if (!firmware) throw new Error('Choose firmware first.')
      return createQaBenchJob(station.id, {
        kind,
        probeSerial,
        connectMode,
        firmwareId: firmware.id,
        address: firmware.format === 'bin' ? address : undefined,
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

  const addressValid =
    firmware?.format !== 'bin' || ADDRESS_PATTERN.test(address)
  const blockedReason = !online
    ? 'The agent is offline.'
    : !programmerReady
      ? 'STM32CubeProgrammer was not found on the bench PC.'
      : busy
        ? 'A job is already running on this station.'
        : null

  return (
    <Panel
      title='Flash'
      description='Program a board over SWD with STM32CubeProgrammer on the bench PC.'
      actions={
        online ? null : <StatusBadge tone='muted'>Agent offline</StatusBadge>
      }
    >
      <div className='grid gap-4'>
        <div className='grid gap-3 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]'>
          <FormField
            label='Firmware'
            help={
              firmware
                ? `${firmware.channel === 'qa' ? 'QA firmware' : 'Production'} · ${firmware.format.toUpperCase()} · ${formatBytes(firmware.sizeBytes)} · sha256 ${shortSha(firmware.sha256)} · ${formatAdminDateTime(firmware.createdAt)}`
                : 'Upload the .bin or .hex from apps/firmware/.builds/artifacts.'
            }
          >
            <div className='flex gap-2'>
              <Select
                value={firmwareId ?? undefined}
                onValueChange={setFirmwareId}
                disabled={firmwareUploads.length === 0}
              >
                <SelectTrigger className='min-w-0 flex-1'>
                  <SelectValue placeholder='No firmware uploaded yet' />
                </SelectTrigger>
                <SelectContent>
                  {firmwareUploads.map((upload) => (
                    <SelectItem key={upload.id} value={upload.id}>
                      <FirmwareChannelTag channel={upload.channel} />
                      <span className='font-mono text-xs'>
                        {upload.version ? `${upload.version} · ` : ''}
                        {upload.fileName}
                      </span>
                      <span className='text-ink-3'>
                        {formatBytes(upload.sizeBytes)} ·{' '}
                        {formatAdminDateTime(upload.createdAt)}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <input
                ref={fileInput}
                type='file'
                accept='.bin,.hex'
                className='hidden'
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  event.target.value = ''
                  if (file) setPendingFile(file)
                }}
              />
              <Button
                variant='outline'
                disabled={uploadMutation.isPending}
                onClick={() => fileInput.current?.click()}
              >
                <FileUp />
                {uploadMutation.isPending ? 'Uploading…' : 'Upload'}
              </Button>
            </div>
          </FormField>

          <FormField
            label='Flash address'
            help={
              firmware?.format === 'hex'
                ? 'HEX files carry their own addresses.'
                : 'Main flash on the STM32G071.'
            }
            error={
              addressValid ? undefined : 'Use a hex address like 0x08000000.'
            }
          >
            <Input
              value={firmware?.format === 'hex' ? '—' : address}
              disabled={firmware?.format === 'hex'}
              onChange={(event) => setAddress(event.target.value.trim())}
              className='font-mono text-xs'
              aria-invalid={!addressValid}
            />
          </FormField>

          <FormField label='ST-LINK probe'>
            <Select value={probe} onValueChange={setProbe}>
              <SelectTrigger className='w-full'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={FIRST_PROBE}>
                  {probes.length === 0
                    ? 'No probe detected'
                    : 'First connected probe'}
                </SelectItem>
                {probes.map((entry) => (
                  <SelectItem key={entry.serial} value={entry.serial}>
                    <span className='font-mono text-xs'>{entry.serial}</span>
                    {entry.boardName && entry.boardName !== '--' ? (
                      <span className='text-ink-3'>{entry.boardName}</span>
                    ) : null}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          <FormField
            label='Connect mode'
            help={
              QA_CONNECT_MODES.find((mode) => mode.value === connectMode)?.help
            }
          >
            <Select
              value={connectMode}
              onValueChange={(value) => setConnectMode(value as QaConnectMode)}
            >
              <SelectTrigger className='w-full'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {QA_CONNECT_MODES.map((mode) => (
                  <SelectItem key={mode.value} value={mode.value}>
                    {mode.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
        </div>

        <div className='flex flex-wrap items-center gap-2'>
          <Button
            disabled={
              !!blockedReason ||
              !firmware ||
              !addressValid ||
              jobMutation.isPending
            }
            onClick={() => jobMutation.mutate('flash')}
          >
            <Zap />
            Flash board
          </Button>
          <Button
            variant='outline'
            disabled={!!blockedReason || jobMutation.isPending}
            onClick={() => jobMutation.mutate('identify')}
            title='Connect over SWD and read the chip ID without writing anything'
          >
            <Cpu />
            Identify
          </Button>
          {blockedReason && !busy ? (
            <span className='text-xs text-ink-3'>{blockedReason}</span>
          ) : null}
        </div>

        {shownJob ? (
          <JobView
            job={shownJob}
            cancelling={cancelMutation.isPending}
            onCancel={() => cancelMutation.mutate(shownJob.id)}
          />
        ) : null}
      </div>
      {pendingFile ? (
        <UploadFirmwareDialog
          key={`${pendingFile.name}-${pendingFile.lastModified}`}
          file={pendingFile}
          uploading={uploadMutation.isPending}
          onUpload={(meta) =>
            uploadMutation.mutate({ file: pendingFile, ...meta })
          }
          onClose={() => setPendingFile(null)}
        />
      ) : null}
    </Panel>
  )
}

function JobView({
  job,
  cancelling,
  onCancel,
}: {
  job: QaBenchJobDto
  cancelling: boolean
  onCancel: () => void
}) {
  const active = isQaJobActive(job)
  const lines = useJobLog(job)
  const result = job.result
  const target = result?.target
  const phaseIndex = job.phase
    ? QA_FLASH_PHASES.findIndex((phase) => phase.value === job.phase)
    : -1

  return (
    <div className='grid gap-3 rounded-lg bg-canvas p-4 shadow-[inset_0_0_0_1px_var(--line)]'>
      <div className='flex flex-wrap items-center gap-x-3 gap-y-2'>
        <h3 className='truncate text-sm font-semibold text-ink'>
          {describeQaJob(job)}
        </h3>
        {active ? (
          <LiveBadge>
            {job.status === 'queued' ? 'Waiting for agent' : 'Running'}
          </LiveBadge>
        ) : (
          <StatusBadge tone={qaJobStatusTone[job.status]}>
            {qaJobStatusLabel[job.status]}
          </StatusBadge>
        )}
        <span className='text-xs text-ink-3 tabular'>
          {job.probeSerial ? `SN ${job.probeSerial} · ` : ''}
          {job.requestedByName ? `${job.requestedByName} · ` : ''}
          {formatAdminDateTime(job.createdAt)}
          {result ? ` · ${formatDuration(result.durationMs)}` : ''}
        </span>
        {active ? (
          <Button
            variant='ghost'
            size='sm'
            className='ms-auto'
            disabled={cancelling}
            onClick={onCancel}
          >
            <Ban />
            Cancel
          </Button>
        ) : null}
      </div>

      {job.kind === 'flash' ? (
        <>
          <div className='h-1.5 overflow-hidden rounded-full bg-white/6'>
            <i
              className={cn(
                'block h-full rounded-full transition-[width] duration-150',
                job.status === 'succeeded'
                  ? 'bg-ok'
                  : job.status === 'failed' || job.status === 'cancelled'
                    ? 'bg-breach'
                    : 'bg-trail'
              )}
              style={{ width: `${progressWidth(job, phaseIndex)}%` }}
            />
          </div>
          <div className='flex flex-wrap gap-1.5'>
            {QA_FLASH_PHASES.map((phase, index) => {
              const done = job.status === 'succeeded' || index < phaseIndex
              const current = active && index === phaseIndex
              const failedHere =
                !active && job.status !== 'succeeded' && index === phaseIndex
              return (
                <span
                  key={phase.value}
                  className={cn(
                    'inline-flex h-5 items-center gap-1 rounded-full px-2 text-xs font-medium',
                    done && 'bg-ok-wash text-ok',
                    current && 'trail-border bg-canvas text-ink',
                    failedHere && 'bg-breach-wash text-breach',
                    !done && !current && !failedHere && 'bg-white/5 text-ink-3'
                  )}
                >
                  {done ? (
                    <Check className='size-3' />
                  ) : failedHere ? (
                    <X className='size-3' />
                  ) : null}
                  {phase.label}
                  {current && job.percent != null ? (
                    <span className='tabular text-ink-2'>{job.percent}%</span>
                  ) : null}
                </span>
              )
            })}
          </div>
        </>
      ) : null}

      {result?.error ? (
        <p className='rounded-md bg-breach-wash px-3 py-2 text-sm text-breach'>
          {result.error}
        </p>
      ) : null}

      {target ? (
        <dl className='grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4'>
          <TargetValue label='Device' value={target.deviceName} />
          <TargetValue
            label='Flash'
            value={target.flashSizeKb ? `${target.flashSizeKb} KB` : null}
          />
          <TargetValue label='Target voltage' value={target.voltage} />
          <TargetValue label='Chip UID' value={formatUid(target.uid)} mono />
          {job.kind === 'flash' ? (
            <TargetValue
              label='Verify'
              value={
                result?.verified == null
                  ? null
                  : result.verified
                    ? 'Matched'
                    : 'Not verified'
              }
            />
          ) : null}
          {job.firmware ? (
            <TargetValue
              label='Image'
              value={`${job.firmware.fileName} @ ${job.firmware.format === 'hex' ? 'hex' : job.address}`}
              mono
              className='sm:col-span-2'
            />
          ) : null}
        </dl>
      ) : null}

      <LogConsole
        lines={lines}
        height={active ? 220 : 180}
        emptyLabel={
          active ? 'Waiting for CubeProgrammer output…' : 'No output recorded.'
        }
      />
    </div>
  )
}

function TargetValue({
  label,
  value,
  mono,
  className,
}: {
  label: string
  value: string | null | undefined
  mono?: boolean
  className?: string
}) {
  return (
    <div className={cn('min-w-0', className)}>
      <dt className='label-caps'>{label}</dt>
      <dd
        className={cn(
          'mt-1 text-ink',
          mono ? 'font-mono text-xs break-all' : 'truncate'
        )}
      >
        {value ?? <span className='text-ink-3'>—</span>}
      </dd>
    </div>
  )
}

function progressWidth(job: QaBenchJobDto, phaseIndex: number) {
  if (job.status === 'succeeded') return 100
  if (phaseIndex < 0) return job.status === 'running' ? 4 : 0
  // Program and verify each report a percentage; the other phases are short steps.
  const span = 100 / QA_FLASH_PHASES.length
  const within = job.percent != null ? job.percent / 100 : 0.5
  return Math.min(100, Math.round(span * phaseIndex + span * within))
}

/** Server log for finished jobs, plus live lines while the job runs. */
function useJobLog(job: QaBenchJobDto) {
  const active = isQaJobActive(job)
  const counter = useRef(0)

  const logQuery = useQuery({
    queryKey: [...adminQueryKeys.qa.jobLog(job.id), active ? 'live' : 'final'],
    queryFn: () => getQaBenchJobLog(job.id),
    staleTime: active ? 0 : Infinity,
  })

  // Live lines belong to one fetched snapshot; a newer snapshot already contains them.
  const snapshotKey = `${job.id}:${logQuery.dataUpdatedAt}`
  const [live, setLive] = useState<{ key: string; lines: ConsoleLine[] }>({
    key: snapshotKey,
    lines: [],
  })

  useQaBenchEvents((event) => {
    if (event.type !== 'admin:qa.job.log' || event.data.jobId !== job.id) return
    const incoming = event.data.lines.map((text) => ({
      id: ++counter.current,
      text,
      tone: toneForProgrammerLine(text),
    }))
    setLive((current) => ({
      key: snapshotKey,
      lines: [
        ...(current.key === snapshotKey ? current.lines : []),
        ...incoming,
      ].slice(-2000),
    }))
  })

  return useMemo(() => {
    const stored = (logQuery.data?.lines ?? []).map((text, index) => ({
      id: -1 - index,
      text,
      tone: toneForProgrammerLine(text),
    }))
    const truncated = logQuery.data?.truncated
      ? [
          {
            id: -1_000_000,
            text: '… earlier output was truncated',
            tone: 'dim' as const,
          },
        ]
      : []
    const liveLines = live.key === snapshotKey ? live.lines : []
    return [...truncated, ...stored, ...liveLines]
  }, [logQuery.data, live, snapshotKey])
}
