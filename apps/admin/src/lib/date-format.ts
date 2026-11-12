import { format } from 'date-fns'

function toDate(value: string | Date | null | undefined) {
  if (!value) {
    return null
  }

  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export function formatAdminDate(value: string | Date | null | undefined) {
  const date = toDate(value)

  if (date === null) {
    return value ? 'Invalid date' : 'Never'
  }

  return format(date, 'dd MMM yy')
}

export function formatAdminDateTime(value: string | Date | null | undefined) {
  const date = toDate(value)

  if (date === null) {
    return value ? 'Invalid date' : 'Never'
  }

  return format(date, 'dd MMM yy, HH:mm')
}

export function formatAdminDateTimeWithSeconds(
  value: string | Date | null | undefined
) {
  const date = toDate(value)

  if (date === null) {
    return value ? 'Invalid date' : 'Never'
  }

  return format(date, 'dd MMM yy, HH:mm:ss')
}

export function formatAdminRelativeDate(
  value: string | Date | null | undefined,
  now = Date.now()
) {
  const date = toDate(value)

  if (date === null) {
    return value ? 'Invalid date' : 'Never'
  }

  const totalSeconds = Math.max(0, Math.floor((now - date.getTime()) / 1000))

  if (totalSeconds < 60) {
    return `${totalSeconds}s ago`
  }

  const totalMinutes = Math.floor(totalSeconds / 60)
  if (totalMinutes < 60) {
    return `${totalMinutes}m ${totalSeconds % 60}s ago`
  }

  const totalHours = Math.floor(totalMinutes / 60)
  if (totalHours < 24) {
    return `${totalHours}h ${totalMinutes % 60}m ago`
  }

  const totalDays = Math.floor(totalHours / 24)
  return `${totalDays}d ${totalHours % 24}h ago`
}
