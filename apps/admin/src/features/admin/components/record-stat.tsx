import type { ReactNode } from 'react'

/** A labelled tile for record summaries whose values are pills or links. */
export function RecordStat({
  label,
  value,
}: {
  label: string
  value: ReactNode
}) {
  return (
    <div className='min-w-0 rounded-lg bg-raised px-4 py-3 shadow-[inset_0_0_0_1px_var(--line-faint)]'>
      <div className='label-caps truncate'>{label}</div>
      <div className='mt-2 flex min-h-7 items-center text-sm font-medium text-ink'>
        {value}
      </div>
    </div>
  )
}
