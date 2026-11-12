import type { ComponentProps } from 'react'
import { useLiveNow } from '@/hooks/use-live-now'
import {
  formatAdminDateTimeWithSeconds,
  formatAdminRelativeDate,
} from '@/lib/date-format'
import { cn } from '@/lib/utils'
import { getFreshness } from '@/components/patterns/freshness'
import { FreshnessIndicator } from '@/components/patterns/live'

type AdminLastSeenProps = Omit<
  ComponentProps<'time'>,
  'children' | 'dateTime'
> & {
  value: Date | null | string | undefined
}

export function AdminLastSeen({
  value,
  className,
  ...props
}: AdminLastSeenProps) {
  const now = useLiveNow()
  const date = value instanceof Date ? value : value ? new Date(value) : null
  const validDate = date && Number.isFinite(date.getTime()) ? date : null
  const label = formatAdminRelativeDate(value, now)

  if (!validDate) {
    return <span className={cn('tabular-nums', className)}>{label}</span>
  }

  return (
    <time
      {...props}
      className={cn('tabular-nums', className)}
      dateTime={validDate.toISOString()}
      title={props.title ?? formatAdminDateTimeWithSeconds(validDate)}
    >
      {label}
    </time>
  )
}

/** Last-seen time on the live / recent / stale / offline scale. */
export function LastSeenFreshness({
  value,
  className,
}: {
  value: Date | null | string | undefined
  className?: string
}) {
  const now = useLiveNow()
  const date = value instanceof Date ? value : value ? new Date(value) : null
  const validDate = date && Number.isFinite(date.getTime()) ? date : null

  return (
    <FreshnessIndicator
      freshness={getFreshness(validDate, now)}
      className={className}
    >
      {validDate ? (
        <time
          dateTime={validDate.toISOString()}
          title={formatAdminDateTimeWithSeconds(validDate)}
        >
          {formatAdminRelativeDate(validDate, now)}
        </time>
      ) : (
        'Never'
      )}
    </FreshnessIndicator>
  )
}
