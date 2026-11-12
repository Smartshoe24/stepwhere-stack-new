import type { AdminBanUserInput, AdminUserListItemDto } from '@stepwhere/types'
import { formatAdminDateTime } from '@/lib/date-format'

export const userRoleOptions = [
  { label: 'User', value: 'user' as const },
  { label: 'Admin', value: 'admin' as const },
]

export const userStatusOptions = [
  { label: 'Active', value: 'active' as const },
  { label: 'Suspended', value: 'suspended' as const },
]

export const userBanStateOptions = [
  { label: 'Banned', value: 'banned' as const },
  { label: 'Not banned', value: 'not_banned' as const },
]

export const onboardingOptions = [
  { label: 'Completed', value: 'completed' as const },
  { label: 'Incomplete', value: 'incomplete' as const },
]

export const banExpirationOptions = [
  { label: 'Never expires', value: 'never' as const },
  { label: '1 day', value: '86400' as const },
  { label: '7 days', value: '604800' as const },
  { label: '30 days', value: '2592000' as const },
  { label: 'Custom seconds', value: 'custom' as const },
]

export function buildBanInput(values: {
  banReason: string
  expirationMode: (typeof banExpirationOptions)[number]['value']
  customSeconds: string
}): AdminBanUserInput {
  const reason = values.banReason.trim()

  if (values.expirationMode === 'never') {
    return {
      banReason: reason || null,
      banExpiresIn: null,
    }
  }

  const seconds =
    values.expirationMode === 'custom'
      ? Number.parseInt(values.customSeconds, 10)
      : Number.parseInt(values.expirationMode, 10)

  return {
    banReason: reason || null,
    banExpiresIn: Number.isFinite(seconds) && seconds > 0 ? seconds : null,
  }
}

export function downloadUsersCsv(
  users: AdminUserListItemDto[],
  filename = `stepwhere-users-${new Date().toISOString().slice(0, 10)}.csv`
) {
  const rows = [
    [
      'id',
      'displayName',
      'phoneNumber',
      'email',
      'role',
      'status',
      'banned',
      'banReason',
      'banExpires',
      'familyName',
      'familyRole',
      'childrenCount',
      'previewChildren',
      'onboardingCompleted',
      'lastSeenAt',
      'createdAt',
    ],
    ...users.map((user) => [
      user.id,
      user.displayName,
      user.phoneNumber,
      user.email ?? '',
      user.role,
      user.status,
      String(user.banned),
      user.banReason ?? '',
      user.banExpires ?? '',
      user.family.organization?.name ?? '',
      user.family.memberRole ?? '',
      user.childRelationship.count,
      user.childRelationship.previewChildren.map((child) => child.name).join('; '),
      String(user.onboardingCompleted),
      formatAdminDateTime(user.lastSeenAt),
      formatAdminDateTime(user.createdAt),
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
