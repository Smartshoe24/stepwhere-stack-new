import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { userEvent } from 'vitest/browser'
import type { AdminUserListItemDto } from '@stepwhere/types'
import {
  banAdminUser,
  unbanAdminUser,
  updateAdminUser,
} from '@/lib/api-client'
import { AdminUserDialogs } from './admin-user-dialogs'

vi.mock('@/lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-client')>()
  return {
    ...actual,
    banAdminUser: vi.fn(),
    unbanAdminUser: vi.fn(),
    updateAdminUser: vi.fn(),
  }
})

const baseUser: AdminUserListItemDto = {
  id: 'user-1',
  displayName: 'Admin User',
  email: 'admin@example.com',
  emailVerified: true,
  phoneNumber: '+911111111111',
  avatarUrl: null,
  currentAddress: null,
  dateOfBirth: null,
  onboardingCompleted: true,
  role: 'admin',
  status: 'active',
  banned: false,
  banReason: null,
  banExpires: null,
  lastSeenAt: null,
  family: {
    organization: null,
    memberRole: null,
    permissions: {
      canManageChildren: false,
      canManageGeofences: false,
      canManageMembers: false,
      canManageJoinCodes: false,
      canCreateShareLinks: false,
    },
    requiresOnboarding: false,
  },
  childRelationship: {
    count: 0,
    previewChildren: [],
  },
  createdAt: '2026-06-16T12:00:00.000Z',
  updatedAt: '2026-06-16T12:00:00.000Z',
}

function renderDialogs(overrides?: Partial<React.ComponentProps<typeof AdminUserDialogs>>) {
  const queryClient = new QueryClient()

  return render(
    <QueryClientProvider client={queryClient}>
      <AdminUserDialogs
        accessUser={null}
        onAccessUserChange={vi.fn()}
        banUser={null}
        onBanUserChange={vi.fn()}
        detailUser={null}
        onDetailUserChange={vi.fn()}
        {...overrides}
      />
    </QueryClientProvider>
  )
}

describe('AdminUserDialogs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(updateAdminUser).mockResolvedValue(baseUser)
    vi.mocked(banAdminUser).mockResolvedValue({
      ...baseUser,
      banned: true,
      banReason: 'Test',
      banExpires: null,
    })
    vi.mocked(unbanAdminUser).mockResolvedValue(baseUser)
  })

  it('calls updateAdminUser when saving access changes', async () => {
    const screen = await renderDialogs({
      accessUser: baseUser,
    })

    await userEvent.click(screen.getByRole('button', { name: /Save changes/i }))

    await vi.waitFor(() =>
      expect(updateAdminUser).toHaveBeenCalledWith('user-1', {
        role: 'admin',
        status: 'active',
      })
    )
  })

  it('calls banAdminUser when banning a user', async () => {
    const screen = await renderDialogs({
      banUser: baseUser,
    })

    await userEvent.fill(screen.getByLabelText(/Reason/i), 'Test ban')
    await userEvent.click(screen.getByRole('button', { name: /Ban user/i }))

    await vi.waitFor(() =>
      expect(banAdminUser).toHaveBeenCalledWith('user-1', {
        banReason: 'Test ban',
        banExpiresIn: null,
      })
    )
  })
})
