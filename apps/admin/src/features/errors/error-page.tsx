import type { ReactNode } from 'react'
import { useNavigate, useRouter } from '@tanstack/react-router'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

/** Shared layout for 401/403/404/500/503. */
export function ErrorPage({
  code,
  title,
  description,
  actions,
  showNavigation = true,
  className,
}: {
  code?: string
  title: ReactNode
  description: ReactNode
  actions?: ReactNode
  showNavigation?: boolean
  className?: string
}) {
  const navigate = useNavigate()
  const { history } = useRouter()
  return (
    <div
      className={cn(
        'grid min-h-svh w-full place-items-center bg-canvas px-4 py-10',
        className
      )}
    >
      <div className='flex max-w-md flex-col items-center gap-2 text-center'>
        {code ? (
          <span className='font-mono text-sm font-medium text-ink-3 tabular'>
            {code}
          </span>
        ) : null}
        <h1 className='text-2xl font-semibold tracking-[-0.02em] text-balance text-ink'>
          {title}
        </h1>
        <span className='my-2 h-px w-12 bg-trail' aria-hidden='true' />
        <p className='text-sm text-pretty text-ink-3'>{description}</p>
        {showNavigation || actions ? (
          <div className='mt-5 flex flex-wrap justify-center gap-2'>
            {showNavigation ? (
              <>
                <Button variant='outline' onClick={() => history.go(-1)}>
                  Go back
                </Button>
                <Button onClick={() => navigate({ to: '/' })}>
                  Back to overview
                </Button>
              </>
            ) : null}
            {actions}
          </div>
        ) : null}
      </div>
    </div>
  )
}
