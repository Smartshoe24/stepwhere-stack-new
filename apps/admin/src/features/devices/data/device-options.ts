import type { AdminCreateDeviceInput, AdminDeviceDto } from '@stepwhere/types'
import { formatAdminDateTime } from '@/lib/date-format'

export const adminDevicesQueryKey = ['admin', 'devices'] as const
export const adminChildrenQueryKey = ['admin', 'children'] as const

export const devicePlatformOptions = [
  { label: 'Android', value: 'android' as const },
  { label: 'iOS', value: 'ios' as const },
  { label: 'Embedded', value: 'embedded' as const },
  { label: 'Unknown', value: 'unknown' as const },
]

export const deviceStatusOptions = [
  { label: 'Fresh', value: 'fresh' as const },
  { label: 'Active', value: 'active' as const },
  { label: 'Inactive', value: 'inactive' as const },
  { label: 'Blocked', value: 'blocked' as const },
]

export const deviceBindingOptions = [
  { label: 'Bound', value: 'bound' as const },
  { label: 'Unbound', value: 'unbound' as const },
]

export const deviceConnectionOptions = [
  { label: 'Connected', value: 'connected' as const },
  { label: 'Stale', value: 'stale' as const },
  { label: 'Offline', value: 'offline' as const },
  { label: 'Sleep', value: 'sleep' as const },
  { label: 'Never seen', value: 'never' as const },
]

export function normalizeDeviceDraft(input: AdminCreateDeviceInput) {
  return {
    hardwareIdentifier: input.hardwareIdentifier.trim().toUpperCase(),
    displayName: input.displayName?.trim() || null,
    platform: input.platform ?? 'unknown',
    status: input.status ?? 'fresh',
  }
}

export function downloadDevicesCsv(
  devices: AdminDeviceDto[],
  filename = `stepwhere-devices-${new Date().toISOString().slice(0, 10)}.csv`
) {
  const rows = [
    [
      'id',
      'hardwareIdentifier',
      'displayName',
      'platform',
      'status',
      'boundChild',
      'reservedByUserId',
      'reservedByOrganizationId',
      'reservedUntil',
      'lastSeenAt',
      'createdAt',
      'updatedAt',
    ],
    ...devices.map((device) => [
      device.id,
      device.hardwareIdentifier,
      device.displayName ?? '',
      device.platform,
      device.status,
      device.activeBinding?.childName ?? '',
      device.reservation.reservedByUserId ?? '',
      device.reservation.reservedByOrganizationId ?? '',
      formatAdminDateTime(device.reservation.reservedUntil),
      formatAdminDateTime(device.lastSeenAt),
      formatAdminDateTime(device.createdAt),
      formatAdminDateTime(device.updatedAt),
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
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}
