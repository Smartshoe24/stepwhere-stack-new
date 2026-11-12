import { QueryClient } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { redirectAuthenticatedAdmin } from '@/features/auth/session'
import { getAdminSetupStatus } from '@/lib/api-client'
import { signInBeforeLoad } from './sign-in'

const getAdminSetupStatusMock = vi.mocked(getAdminSetupStatus)
const redirectAuthenticatedAdminMock = vi.mocked(redirectAuthenticatedAdmin)

vi.mock('@/features/auth/session', () => ({
  redirectAuthenticatedAdmin: vi.fn(),
}))

vi.mock('@/features/auth/sign-in', () => ({
  SignIn: () => null,
}))

vi.mock('@/lib/api-client', () => ({
  getAdminSetupStatus: vi.fn(),
}))

async function expectRedirectTo(action: Promise<unknown>, to: string) {
  try {
    await action
  } catch (error) {
    expect(error).toMatchObject({
      options: {
        to,
      },
    })
    return
  }

  throw new Error(`Expected redirect to ${to}.`)
}

describe('signInBeforeLoad', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('redirects to admin setup while it is required', async () => {
    getAdminSetupStatusMock.mockResolvedValue({
      required: true,
      email: 'admin@stepwhere.in',
    })

    await expectRedirectTo(
      signInBeforeLoad({
        context: {
          queryClient: new QueryClient(),
        },
      }),
      '/setup'
    )

    expect(redirectAuthenticatedAdminMock).not.toHaveBeenCalled()
  })

  it('keeps normal sign-in behavior once setup is not required', async () => {
    const queryClient = new QueryClient()
    getAdminSetupStatusMock.mockResolvedValue({
      required: false,
      email: 'admin@stepwhere.in',
    })

    await signInBeforeLoad({
      context: {
        queryClient,
      },
    })

    expect(redirectAuthenticatedAdminMock).toHaveBeenCalledWith(queryClient)
  })

  it('falls back to normal sign-in when the setup check fails', async () => {
    const queryClient = new QueryClient()
    getAdminSetupStatusMock.mockRejectedValue(new Error('network down'))

    await signInBeforeLoad({
      context: {
        queryClient,
      },
    })

    expect(redirectAuthenticatedAdminMock).toHaveBeenCalledWith(queryClient)
  })
})
