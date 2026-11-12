import type { AdminChildListItemDto } from '@stepwhere/types'
import { formatAdminDateTime } from '@/lib/date-format'

export const childLifecycleOptions = [
  { label: 'Active', value: 'active' as const },
  { label: 'Archived', value: 'archived' as const },
]

export const childTrackingOptions = [
  { label: 'Safe', value: 'safe' as const },
  { label: 'Transit', value: 'transit' as const },
  { label: 'Alert', value: 'alert' as const },
  { label: 'Offline', value: 'offline' as const },
]

export const childTelemetryOptions = [
  { label: 'Active', value: 'active' as const },
  { label: 'Sleep', value: 'sleep' as const },
  { label: 'Offline', value: 'offline' as const },
  { label: 'Connecting', value: 'connecting' as const },
]

export const childBindingOptions = [
  { label: 'Bound', value: 'bound' as const },
  { label: 'Unbound', value: 'unbound' as const },
]

export function downloadChildrenCsv(children: AdminChildListItemDto[]) {
  const rows = [
    [
      'id',
      'name',
      'parentName',
      'trackingStatus',
      'telemetryState',
      'device',
      'lastSeenAt',
      'createdAt',
    ],
    ...children.map((child) => [
      child.id,
      child.name,
      child.parent?.displayName ?? '',
      child.summary.status,
      child.summary.telemetryState,
      child.summary.deviceSummary?.hardwareIdentifier ?? '',
      formatAdminDateTime(child.summary.lastSeenAt),
      formatAdminDateTime(child.createdAt),
    ]),
  ]

  const csv = rows
    .map((row) =>
      row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(',')
    )
    .join('\n')

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `stepwhere-children-${new Date().toISOString().slice(0, 10)}.csv`
  anchor.click()
  URL.revokeObjectURL(url)
}
