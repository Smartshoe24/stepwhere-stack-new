import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import type { Freshness } from './freshness'

/** The trail in motion. Only for data that is live right now. */
function LiveDot({ className }: { className?: string }) {
  return (
    <span
      aria-hidden='true'
      className={cn(
        'relative inline-block size-2 shrink-0 rounded-full bg-trail',
        "after:absolute after:-inset-1 after:animate-[trail-breathe_2.4s_var(--ease-move)_infinite] after:rounded-full after:bg-[radial-gradient(circle,rgb(255_102_203/0.55)_0%,rgb(245_207_141/0)_70%)] after:content-['']",
        className
      )}
    />
  )
}

export function LiveBadge({
  children = 'Live',
  className,
}: {
  children?: ReactNode
  className?: string
}) {
  return (
    <span
      className={cn(
        'trail-border inline-flex h-[22px] items-center gap-[7px] rounded-full bg-canvas ps-2 pe-2.5 text-xs font-semibold whitespace-nowrap text-ink',
        className
      )}
    >
      <LiveDot />
      {children}
    </span>
  )
}

const tickColor: Record<Freshness, [string, string, string]> = {
  live: ['bg-trail-v', 'bg-trail-v', 'bg-trail-v'],
  recent: ['bg-ok', 'bg-ok', 'bg-white/12'],
  stale: ['bg-caution', 'bg-white/12', 'bg-white/12'],
  offline: ['bg-white/12', 'bg-white/12', 'bg-white/12'],
}

const textColor: Record<Freshness, string> = {
  live: 'text-ink',
  recent: 'text-ink-2',
  stale: 'text-caution',
  offline: 'text-ink-3',
}

/** Three signal ticks plus a label: how recently something reported. */
export function FreshnessIndicator({
  freshness,
  children,
  className,
}: {
  freshness: Freshness
  children: ReactNode
  className?: string
}) {
  const ticks = tickColor[freshness]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 text-xs whitespace-nowrap tabular',
        textColor[freshness],
        className
      )}
    >
      <span aria-hidden='true' className='inline-flex items-end gap-0.5'>
        <i className={cn('block h-[5px] w-[3px] rounded-[1px]', ticks[0])} />
        <i className={cn('block h-2 w-[3px] rounded-[1px]', ticks[1])} />
        <i className={cn('block h-[11px] w-[3px] rounded-[1px]', ticks[2])} />
      </span>
      <span className='sr-only'>{freshness}: </span>
      {children}
    </span>
  )
}
