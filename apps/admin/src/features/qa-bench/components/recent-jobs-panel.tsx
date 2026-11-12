import type { QaBenchJobDto } from '@stepwhere/types'
import { Cpu, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatAdminDateTime } from '@/lib/date-format'
import { StatusBadge } from '@/features/admin/components/status-badge'
import { LiveBadge } from '@/components/patterns/live'
import { Panel } from '@/components/patterns/panel'
import { EmptyState } from '@/components/patterns/states'
import {
  describeQaJob,
  formatDuration,
  isQaJobActive,
  qaJobStatusLabel,
  qaJobStatusTone,
} from '../lib/qa-bench-format'

export function RecentJobsPanel({
  jobs,
  selectedJobId,
  onSelect,
}: {
  jobs: QaBenchJobDto[]
  selectedJobId: string | null
  onSelect: (jobId: string) => void
}) {
  return (
    <Panel
      title='Recent jobs'
      description='Every flash and identify on this station.'
      flush
    >
      {jobs.length === 0 ? (
        <EmptyState
          compact
          title='No jobs yet'
          description='Flash or identify a board to see it here.'
        />
      ) : (
        <ul className='divide-y divide-line-faint'>
          {jobs.map((job) => {
            const selected = job.id === selectedJobId
            return (
              <li key={job.id}>
                <button
                  type='button'
                  onClick={() => onSelect(job.id)}
                  className={cn(
                    'focus-trail relative flex w-full items-center gap-3 px-4 py-2.5 text-start transition-colors hover:bg-white/[0.025]',
                    selected && 'bg-here-wash'
                  )}
                >
                  {selected ? (
                    <span
                      aria-hidden='true'
                      className='absolute inset-y-2 start-0 w-px bg-trail-v'
                    />
                  ) : null}
                  <span className='text-ink-3 [&_svg]:size-4'>
                    {job.kind === 'flash' ? <Zap /> : <Cpu />}
                  </span>
                  <span className='min-w-0 flex-1'>
                    <span
                      className={cn(
                        'block truncate text-sm',
                        selected ? 'text-here' : 'text-ink'
                      )}
                    >
                      {describeQaJob(job)}
                    </span>
                    <span className='block truncate text-xs text-ink-3 tabular'>
                      {formatAdminDateTime(job.createdAt)}
                      {job.result
                        ? ` · ${formatDuration(job.result.durationMs)}`
                        : ''}
                      {job.result?.target?.uid
                        ? ` · UID …${job.result.target.uid.slice(-8)}`
                        : ''}
                    </span>
                  </span>
                  {isQaJobActive(job) ? (
                    <LiveBadge>
                      {job.percent != null ? `${job.percent}%` : 'Running'}
                    </LiveBadge>
                  ) : (
                    <StatusBadge tone={qaJobStatusTone[job.status]}>
                      {qaJobStatusLabel[job.status]}
                    </StatusBadge>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </Panel>
  )
}
