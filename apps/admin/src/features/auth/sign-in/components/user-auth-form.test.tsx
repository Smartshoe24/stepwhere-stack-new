import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { userEvent } from 'vitest/browser'
import { authClient } from '@/lib/auth-client'
import { getSession, signOut } from '@/lib/api-client'
import { UserAuthForm } from './user-auth-form'

const navigate = vi.fn()
const signInEmailMock = vi.hoisted(() => vi.fn())
const getSessionMock = vi.mocked(getSession)
const signOutMock = vi.mocked(signOut)

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    signIn: {
      email: signInEmailMock,
    },
  },
}))

vi.mock('@/lib/api-client', () => ({
  getSession: vi.fn(),
  signOut: vi.fn(),
  stepwhereApiBaseUrl: 'http://localhost:8223',
}))

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>()
  return {
    ...actual,
    useNavigate: () => navigate,
  }
})

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}))

function buildSession(role: 'admin' | 'user') {
  return {
    token: 'session-token',
    expiresAt: '2026-06-16T12:05:00.000Z',
    user: {
      id: `${role}-user-id`,
      displayName: `${role} user`,
      email: `${role}@example.com`,
      emailVerified: true,
      phoneNumber: '+15551234567',
      avatarUrl: null,
      currentAddress: null,
      dateOfBirth: null,
      onboardingCompleted: true,
      role,
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
        requiresOnboarding: true,
      },
      createdAt: '2026-06-16T12:00:00.000Z',
      updatedAt: '2026-06-16T12:00:00.000Z',
    },
  } as const
}

describe('UserAuthForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    signInEmailMock.mockResolvedValue({ data: { token: 'token' }, error: null })
    getSessionMock.mockResolvedValue(buildSession('admin'))
    signOutMock.mockResolvedValue({})
  })

  async function renderForm(props?: React.ComponentProps<typeof UserAuthForm>) {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    })
    const screen = await render(
      <QueryClientProvider client={queryClient}>
        <UserAuthForm {...props} />
      </QueryClientProvider>
    )

    return {
      screen,
      emailInput: screen.getByRole('textbox', { name: /^Email$/i }),
      passwordInput: screen.getByLabelText(/^Password$/i),
      signInButton: screen.getByRole('button', { name: /^Sign in$/i }),
    }
  }

  it('shows validation when submitting an empty form', async () => {
    const { screen, signInButton } = await renderForm()

    await userEvent.click(signInButton)

    await expect
      .element(screen.getByText('Please enter your email.'))
      .toBeInTheDocument()
    await expect
      .element(screen.getByText('Please enter your password.'))
      .toBeInTheDocument()
  })

  it('signs in with email/password, refetches the session, and redirects admins', async () => {
    const { emailInput, passwordInput, signInButton } = await renderForm({
      redirectTo: '/settings',
    })

    await userEvent.fill(emailInput, 'Admin@Example.com')
    await userEvent.fill(passwordInput, 'super-secret-password')
    await userEvent.click(signInButton)

    await vi.waitFor(() =>
      expect(authClient.signIn.email).toHaveBeenCalledWith({
        email: 'admin@example.com',
        password: 'super-secret-password',
        rememberMe: true,
      })
    )
    await vi.waitFor(() => expect(getSessionMock).toHaveBeenCalledOnce())
    await vi.waitFor(() =>
      expect(navigate).toHaveBeenCalledWith({ to: '/settings' })
    )
  })

  it('signs out and redirects non-admin sessions to forbidden', async () => {
    getSessionMock.mockResolvedValue(buildSession('user'))

    const { emailInput, passwordInput, signInButton } = await renderForm()

    await userEvent.fill(emailInput, 'user@example.com')
    await userEvent.fill(passwordInput, 'super-secret-password')
    await userEvent.click(signInButton)

    await vi.waitFor(() =>
      expect(signOutMock).toHaveBeenCalledWith({ suppressUnauthorized: true })
    )
    await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: '/403' }))
  })

  it('shows an auth error returned by Better Auth', async () => {
    signInEmailMock.mockResolvedValue({
      data: null,
      error: { message: 'Invalid email or password.' },
    })

    const { screen, emailInput, passwordInput, signInButton } =
      await renderForm()

    await userEvent.fill(emailInput, 'admin@example.com')
    await userEvent.fill(passwordInput, 'wrong-password')
    await userEvent.click(signInButton)

    await expect
      .element(screen.getByText('Invalid email or password.'))
      .toBeInTheDocument()
    expect(getSessionMock).not.toHaveBeenCalled()
  })
})
