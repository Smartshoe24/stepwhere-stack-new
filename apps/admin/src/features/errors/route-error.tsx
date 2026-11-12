import { useState } from 'react'
import {
  type ErrorComponentProps,
  useNavigate,
  useRouter,
  useRouterState,
} from '@tanstack/react-router'
import { Loader2, RefreshCw, Unplug } from 'lucide-react'
import { ApiNetworkError, ApiTimeoutError } from '@/lib/api-client'
import { AuthLayout } from '@/features/auth/auth-layout'
import { GeneralError } from '@/features/errors/general-error'
import { Button } from '@/components/ui/button'

export function RouteError({ error, reset }: ErrorComponentProps) {
  if (error instanceof ApiNetworkError || error instanceof ApiTimeoutError) {
    return <ApiUnavailableError error={error} reset={reset} />
  }

  return <GeneralError />
}

function ApiUnavailableError({
  error,
  reset,
}: {
  error: ApiNetworkError | ApiTimeoutError
  reset: () => void
}) {
  const navigate = useNavigate()
  const router = useRouter()
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })
  const [isRetrying, setIsRetrying] = useState(false)
  const canReturnToSignIn = pathname !== '/sign-in'

  const retry = async () => {
    if (isRetrying) return

    setIsRetrying(true)
    reset()

    try {
      await router.invalidate()
    } catch {
      // The route error boundary will render the latest connection failure.
    } finally {
      setIsRetrying(false)
    }
  }

  return (
    <AuthLayout
      title='Stepwhere Admin is temporarily unavailable'
      description='The API may be restarting or the database may be briefly unavailable. Your data has not been changed.'
    >
      <div role='alert' className='space-y-5'>
        <div className='flex items-start gap-3 rounded-md bg-inset px-3 py-2.5 shadow-[inset_0_0_0_1px_var(--line)]'>
          <Unplug
            className='mt-0.5 size-4 shrink-0 text-caution'
            aria-hidden='true'
          />
          <div className='min-w-0 space-y-1'>
            <p className='text-sm font-medium text-ink'>
              {error instanceof ApiTimeoutError
                ? 'The connection timed out.'
                : 'The API could not be reached.'}
            </p>
            {import.meta.env.DEV && (
              <p className='font-mono text-2xs break-all text-ink-3'>
                {error.baseUrl}
              </p>
            )}
          </div>
        </div>
        <div className='flex flex-col-reverse gap-2 sm:flex-row sm:justify-end'>
          {canReturnToSignIn && (
            <Button
              variant='outline'
              disabled={isRetrying}
              onClick={() => navigate({ to: '/sign-in' })}
            >
              Return to sign in
            </Button>
          )}
          <Button disabled={isRetrying} onClick={retry}>
            {isRetrying ? (
              <Loader2 className='animate-spin' aria-hidden='true' />
            ) : (
              <RefreshCw aria-hidden='true' />
            )}
            {isRetrying ? 'Retrying…' : 'Retry connection'}
          </Button>
        </div>
      </div>
    </AuthLayout>
  )
}
