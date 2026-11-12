import { Link } from '@tanstack/react-router'
import { useMutation, useQuery } from '@tanstack/react-query'
import {
  QA_TTL_START_COMMAND,
  type QaBoardTestId,
  type QaBoardTestVerdictDto,
  type QaStationDto,
} from '@stepwhere/types'
import { ClipboardCheck, RotateCcw, Square } from 'lucide-react'
import { getQaStationLatestTestRun, writeQaSerial } from '@/lib/api-client'
import { formatAdminDateTime } from '@/lib/date-format'
import { handleServerError } from '@/lib/handle-server-error'
import { adminQueryKeys } from '@/features/admin/query-keys'
import { StatusBadge } from '@/features/admin/components/status-badge'
import { Panel } from '@/components/patterns/panel'
import { Button } from '@/components/ui/button'
import { TestChecklist } from '@/features/qa-units/components/test-checklist'
import {
  runStatusLabel,
  runStatusTone,
  testLabel,
} from '@/features/qa-units/lib/qa-test-format'
import { shortChipUid } from '@/features/qa-units/lib/qa-unit-format'

/**
 * Live results of the QA firmware's board tests. The firmware runs them at
 * boot; Run and Retry type `QA RUN …` into the open serial port.
 */
export function BoardTestsPanel({ station }: { station: QaStationDto }) {
  const runQuery = useQuery({
    queryKey: adminQueryKeys.qa.stationTestRun(station.id),
    queryFn: () => getQaStationLatestTestRun(station.id),
  })
  const run = runQuery.data?.run ?? null
  const verdict = runQuery.data?.verdict ?? null
  const session = station.serialSessions[0] ?? null
  const running = run?.status === 'running'

  const sendMutation = useMutation({
    mutationFn: (command: string) => {
      if (!session) throw new Error('Open the serial port first.')
      return writeQaSerial(station.id, {
        path: session.path,
        data: `${command}\r\n`,
      })
    },
    onError: handleServerError,
  })
  const send = (command: string) => sendMutation.mutate(command)
  const retry = (id: QaBoardTestId) => send(`QA RUN ${id}`)

  return (
    <Panel
      title='Board tests'
      description='Run by the QA firmware over TTL. Results are saved on the unit.'
      actions={
        <>
          {run ? (
            <StatusBadge tone={runStatusTone[run.status]}>
              {runStatusLabel[run.status]}
              {run.status !== 'running'
                ? ` · ${run.passed}/${run.results.length}`
                : ''}
            </StatusBadge>
          ) : null}
          {running ? (
            <Button
              variant='outline'
              size='sm'
              disabled={!session || sendMutation.isPending}
              onClick={() => send('QA ABORT')}
            >
              <Square />
              Abort
            </Button>
          ) : (
            <Button
              size='sm'
              disabled={!session || sendMutation.isPending}
              title={session ? undefined : 'Open the serial port first'}
              onClick={() => send('QA RUN')}
            >
              <ClipboardCheck />
              Run board tests
            </Button>
          )}
        </>
      }
    >
      {!run ? (
        <p className='text-sm text-ink-3'>
          Open the serial port, then flash a QA firmware build. The tests start
          when the board boots
          {session ? ', or press Run board tests.' : '.'}
        </p>
      ) : (
        <div className='grid gap-3'>
          {!session && running ? (
            <p className='text-xs text-caution'>
              The serial port is closed, so results stopped arriving. Open it
              again to keep recording.
            </p>
          ) : null}
          <TestChecklist
            results={run.results}
            onRetry={running ? undefined : retry}
            retryDisabled={!session || sendMutation.isPending}
            onStart={() => send(QA_TTL_START_COMMAND)}
          />
          {!running && verdict ? (
            <RemainingTests
              shown={run.results.map((result) => result.id)}
              verdict={verdict}
              onRetry={retry}
              disabled={!session || sendMutation.isPending}
            />
          ) : null}
          <p className='flex flex-wrap gap-x-2 text-xs text-ink-4'>
            <span>Run {run.runNumber}</span>
            <span>·</span>
            <span className='font-mono'>{run.firmwareVersion}</span>
            <span>·</span>
            {run.unitId ? (
              <Link
                to='/qa/units/$unitId'
                params={{ unitId: run.unitId }}
                className='font-mono hover:text-act'
              >
                chip …{shortChipUid(run.chipUid)}
              </Link>
            ) : (
              <span className='font-mono'>
                chip …{shortChipUid(run.chipUid)}
              </span>
            )}
            <span>·</span>
            <span>{formatAdminDateTime(run.startedAt)}</span>
          </p>
        </div>
      )}
    </Panel>
  )
}

/** Tests outside this run that still keep the unit from passing, e.g. after retrying only GPS. */
export function RemainingTests({
  shown,
  verdict,
  onRetry,
  disabled,
}: {
  shown: QaBoardTestId[]
  verdict: QaBoardTestVerdictDto
  onRetry: (id: QaBoardTestId) => void
  disabled: boolean
}) {
  const failing = verdict.failing.filter((id) => !shown.includes(id))
  const untested = verdict.untested.filter((id) => !shown.includes(id))
  if (failing.length === 0 && untested.length === 0) return null

  const row = (id: QaBoardTestId, label: string, tone: string) => (
    <li key={id} className='flex items-center justify-between gap-3 py-1.5'>
      <span className='text-sm'>
        <span className={tone}>{testLabel(id)}</span>
        <span className='ms-2 text-xs text-ink-3'>{label}</span>
      </span>
      <Button
        variant='ghost'
        size='sm'
        disabled={disabled}
        onClick={() => onRetry(id)}
      >
        <RotateCcw />
        {label === 'not tested yet' ? 'Run' : 'Retry'}
      </Button>
    </li>
  )

  return (
    <div className='rounded-md bg-canvas px-3 py-2 shadow-[inset_0_0_0_1px_var(--line-faint)]'>
      <p className='text-xs font-medium text-ink-2'>
        Still keeping this unit from passing
      </p>
      <ul>
        {failing.map((id) =>
          row(id, 'failed in an earlier run', 'text-breach')
        )}
        {untested.map((id) => row(id, 'not tested yet', 'text-ink'))}
      </ul>
    </div>
  )
}
