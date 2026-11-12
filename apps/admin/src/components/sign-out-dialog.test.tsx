import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { userEvent } from 'vitest/browser'
import { signOut } from '@/lib/api-client'
import { SignOutDialog } from './sign-out-dialog'

const navigate = vi.fn()
const signOutMock = vi.mocked(signOut)
const MOCK_HREF = 'https://app.test/dashboard?tab=1'

vi.mock('@/lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-client')>()
  return {
    ...actual,
    signOut: vi.fn(),
  }
})

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>()
  return {
    ...actual,
    useNavigate: () => navigate,
    useLocation: () => ({ href: MOCK_HREF }),
  }
})

function renderDialog() {
  const queryClient = new QueryClient()

  return render(
    <QueryClientProvider client={queryClient}>
      <SignOutDialog open onOpenChange={vi.fn()} />
    </QueryClientProvider>
  )
}

describe('SignOutDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    signOutMock.mockResolvedValue({})
  })

  it('signs out via the api and navigates to sign-in with the current location as redirect', async () => {
    const { getByRole } = await renderDialog()

    await userEvent.click(getByRole('button', { name: /^Sign out$/i }))

    await vi.waitFor(() => expect(signOutMock).toHaveBeenCalledOnce())
    expect(navigate).toHaveBeenCalledWith({
      to: '/sign-in',
      search: { redirect: MOCK_HREF },
      replace: true,
    })
  })

  it('does not sign out or navigate when Cancel is clicked', async () => {
    const { getByRole } = await renderDialog()

    await userEvent.click(getByRole('button', { name: /^Cancel$/i }))

    expect(signOutMock).not.toHaveBeenCalled()
    expect(navigate).not.toHaveBeenCalled()
  })
})
