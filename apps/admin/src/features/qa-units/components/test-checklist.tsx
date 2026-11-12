import type { QaBoardTestId, QaTestResultDto } from '@stepwhere/types'
import { Check, Circle, Minus, Play, RotateCcw, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  formatSeconds,
  summarizeResult,
  testLabel,
} from '../lib/qa-test-format'

function StatusIcon({ status }: { status: QaTestResultDto['status'] }) {
  if (status === 'passed') return <Check className='size-3.5 text-ok' />
  if (status === 'failed') return <X className='size-3.5 text-breach' />
  if (status === 'skipped') return <Minus className='size-3.5 text-ink-4' />
  if (status === 'running') {
    return (
      <span className='size-3 animate-spin rounded-full border-2 border-toggle border-e-transparent' />
    )
  }
  return <Circle className='size-2.5 text-ink-4' />
}

/** The board tests of one run, in firmware order. */
export function TestChecklist({
  results,
  onRetry,
  retryDisabled,
  onStart,
}: {
  results: QaTestResultDto[]
  /** Shown on failed rows when the run can be repeated from here. */
  onRetry?: (id: QaBoardTestId) => void
  retryDisabled?: boolean
  /** Shown on a test that waits for the operator to press Start. */
  onStart?: () => void
}) {
  return (
    <ul className='divide-y divide-line-faint'>
      {results.map((result) => {
        const summary = summarizeResult(result)
        const live = result.status === 'running'
        return (
          <li
            key={result.id}
            className={cn(
              'grid grid-cols-[20px_minmax(0,1fr)_auto] items-start gap-3 py-2.5',
              live && 'bg-toggle-wash/30 -mx-4 px-4'
            )}
          >
            <span className='mt-0.5 grid size-5 place-items-center'>
              <StatusIcon status={result.status} />
            </span>
            <div className='min-w-0'>
              <div className='flex flex-wrap items-baseline gap-x-2'>
                <span
                  className={cn(
                    'text-sm',
                    result.status === 'failed'
                      ? 'font-medium text-breach'
                      : result.status === 'pending' ||
                          result.status === 'skipped'
                        ? 'text-ink-3'
                        : 'text-ink'
                  )}
                >
                  {testLabel(result.id)}
                </span>
                {summary ? (
                  <span className='truncate text-xs text-ink-3 tabular'>
                    {summary}
                  </span>
                ) : null}
              </div>
              {result.prompt && live ? (
                <div className='mt-1.5 flex items-center justify-between gap-3 rounded-md bg-caution-wash px-2.5 py-1.5 text-xs font-medium text-caution'>
                  <span>{result.prompt}</span>
                  {result.awaiting === 'start' && onStart ? (
                    <Button
                      size='sm'
                      className='h-6 text-[11px]'
                      disabled={retryDisabled}
                      onClick={onStart}
                    >
                      <Play />
                      Start
                    </Button>
                  ) : null}
                </div>
              ) : null}
              {result.progress && live ? (
                <p className='mt-1 text-xs text-ink-2 tabular'>
                  {result.progress}
                </p>
              ) : null}
              {result.error ? (
                <p
                  className={cn(
                    'mt-0.5 text-xs',
                    result.status === 'failed' ? 'text-breach/90' : 'text-ink-4'
                  )}
                >
                  {result.error}
                </p>
              ) : null}
            </div>
            <div className='flex items-center gap-2'>
              {result.ms != null && result.status !== 'skipped' ? (
                <span className='text-xs text-ink-4 tabular'>
                  {formatSeconds(result.ms)}
                </span>
              ) : null}
              {onRetry && result.status === 'failed' ? (
                <Button
                  variant='ghost'
                  size='sm'
                  disabled={retryDisabled}
                  onClick={() => onRetry(result.id)}
                >
                  <RotateCcw />
                  Retry
                </Button>
              ) : null}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
