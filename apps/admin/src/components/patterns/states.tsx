import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'

function TrailGlyph() {
  return (
    <svg viewBox='0 0 64 64' fill='none' className='size-16' aria-hidden='true'>
      <defs>
        <linearGradient id='empty-trail' x1='0' y1='0' x2='1' y2='0'>
          <stop offset='0' stopColor='#F5CF8D' />
          <stop offset='1' stopColor='#FF66CB' />
        </linearGradient>
      </defs>
      <path
        d='M8 50c10-2 12-14 22-16s14 8 26-4'
        stroke='url(#empty-trail)'
        strokeWidth='2'
        strokeLinecap='round'
        strokeDasharray='1 5'
      />
      <circle cx='56' cy='30' r='4' fill='url(#empty-trail)' />
      <circle cx='8' cy='50' r='2.5' fill='#48484F' />
    </svg>
  )
}

/** Nothing here yet: a brand moment with a way forward. */
export function EmptyState({
  title,
  description,
  action,
  compact,
  className,
}: {
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
  compact?: boolean
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center',
        compact ? 'gap-1 px-4 py-8' : 'min-h-56 gap-1 px-6 py-10',
        className
      )}
    >
      {compact ? null : <TrailGlyph />}
      <h3
        className={cn('text-base font-semibold text-ink', !compact && 'mt-3')}
      >
        {title}
      </h3>
      {description ? (
        <p className='max-w-sm text-sm text-pretty text-ink-3'>{description}</p>
      ) : null}
      {action ? <div className='mt-3'>{action}</div> : null}
    </div>
  )
}

/** Skeleton rows that match the real table rhythm so nothing jumps. */
export function TableSkeleton({
  rows = 6,
  columns = 5,
}: {
  rows?: number
  columns?: number
}) {
  return (
    <div aria-busy='true' aria-label='Loading' className='grid gap-3.5 p-4'>
      {Array.from({ length: rows }, (_, row) => (
        <div
          key={row}
          className='grid items-center gap-4'
          style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: columns }, (_, col) => (
            <Skeleton
              key={col}
              className='h-2.5'
              style={{ width: `${55 + ((row * 7 + col * 13) % 40)}%` }}
            />
          ))}
        </div>
      ))}
    </div>
  )
}
