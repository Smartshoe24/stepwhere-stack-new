import type { ComponentProps, ReactNode } from 'react'
import { cn } from '@/lib/utils'

/*
 * Lightweight table for event and history lists (telemetry, geofence events).
 * Meant to sit inside a 16px-padded container (Panel); it bleeds to the edges
 * so the header row is flush.
 * Same rhythm as the data table: 32px uppercase header, 36px rows, faint
 * hairlines. Use native <tr>/<th>/<td> inside.
 */
export function EventTable({
  children,
  className,
  ...props
}: ComponentProps<'table'>) {
  return (
    <div className='-mx-4 overflow-x-auto first:-mt-4 last:-mb-4'>
      <table
        className={cn(
          'min-w-full border-separate border-spacing-0 text-sm',
          '[&_thead_th]:h-8 [&_thead_th]:border-b [&_thead_th]:border-line-faint [&_thead_th]:bg-raised [&_thead_th]:px-3 [&_thead_th]:text-start [&_thead_th]:text-2xs [&_thead_th]:font-medium [&_thead_th]:tracking-[0.04em] [&_thead_th]:whitespace-nowrap [&_thead_th]:text-ink-3 [&_thead_th]:uppercase [&_thead_th:first-child]:ps-4 [&_thead_th:last-child]:pe-4',
          '[&_tbody_td]:h-9 [&_tbody_td]:border-b [&_tbody_td]:border-line-faint [&_tbody_td]:px-3 [&_tbody_td]:py-2 [&_tbody_td]:align-middle [&_tbody_td]:text-ink-2 [&_tbody_td:first-child]:ps-4 [&_tbody_td:last-child]:pe-4 [&_tbody_tr:last-child_td]:border-b-0',
          '[&_tbody_tr]:transition-colors [&_tbody_tr:hover]:bg-white/[0.025]',
          className
        )}
        {...props}
      >
        {children}
      </table>
    </div>
  )
}

export function EventTableEmpty({
  colSpan,
  children,
}: {
  colSpan: number
  children: ReactNode
}) {
  return (
    <tr>
      <td colSpan={colSpan} className='h-20! text-center text-ink-3!'>
        {children}
      </td>
    </tr>
  )
}
