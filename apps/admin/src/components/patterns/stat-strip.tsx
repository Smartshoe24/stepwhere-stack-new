import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

type StatTone = 'ok' | 'caution' | 'breach' | 'info' | 'trail'

const meterTone: Record<StatTone, string> = {
  ok: 'bg-ok',
  caution: 'bg-caution',
  breach: 'bg-breach',
  info: 'bg-info',
  trail: 'bg-trail',
}

/**
 * One strip divided by hairlines instead of a grid of boxes. The value leads;
 * label and change sit quieter.
 */
export function StatStrip({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'grid grid-cols-2 overflow-hidden rounded-lg bg-raised shadow-[inset_0_0_0_1px_var(--line-faint)] lg:auto-cols-fr lg:grid-flow-col lg:grid-cols-none',
        '[&>*]:border-line-faint [&>*]:border-e [&>*]:border-b lg:[&>*]:border-b-0 lg:[&>*:last-child]:border-e-0',
        className
      )}
    >
      {children}
    </div>
  )
}

export function Stat({
  label,
  value,
  unit,
  hint,
  meter,
  tone = 'trail',
  className,
}: {
  label: ReactNode
  value: ReactNode
  unit?: ReactNode
  hint?: ReactNode
  /** 0–1 fill for an optional meter bar. */
  meter?: number | null
  tone?: StatTone
  className?: string
}) {
  return (
    <div className={cn('min-w-0 px-4 pt-4 pb-3.5', className)}>
      <div className='label-caps truncate'>{label}</div>
      <div className='mt-1.5 flex min-h-7 items-baseline gap-1 text-2xl leading-tight font-semibold tracking-[-0.02em] text-ink tabular'>
        {value}
        {unit ? (
          <small className='text-sm font-medium tracking-normal text-ink-3'>
            {unit}
          </small>
        ) : null}
      </div>
      {hint ? (
        <div className='mt-1.5 flex items-center gap-1.5 truncate text-xs text-ink-3'>
          {hint}
        </div>
      ) : null}
      {meter != null ? (
        <div className='mt-2.5 h-1 overflow-hidden rounded-full bg-white/6'>
          <i
            className={cn('block h-full rounded-full', meterTone[tone])}
            style={{
              width: `${Math.round(Math.min(Math.max(meter, 0), 1) * 100)}%`,
            }}
          />
        </div>
      ) : null}
    </div>
  )
}
