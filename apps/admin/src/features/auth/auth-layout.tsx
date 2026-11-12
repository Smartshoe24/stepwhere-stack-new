import type { ReactNode } from 'react'
import { Wordmark } from '@/assets/brand'

type AuthLayoutProps = {
  title: ReactNode
  description?: ReactNode
  footer?: ReactNode
  children: ReactNode
}

/** Centred sign-in shell: the wordmark is the brand moment here. */
export function AuthLayout({
  title,
  description,
  footer,
  children,
}: AuthLayoutProps) {
  return (
    <main
      id='content'
      className='relative grid min-h-svh place-items-center overflow-hidden bg-canvas px-4 py-10'
    >
      <div
        aria-hidden='true'
        className='pointer-events-none absolute inset-x-0 top-0 h-[40vh] bg-[radial-gradient(60%_60%_at_50%_0%,rgb(255_102_203/0.07),transparent_70%)]'
      />
      <div className='relative w-full max-w-[380px]'>
        <div className='mb-8 flex flex-col items-center gap-4'>
          <Wordmark className='h-4' />
          <span className='h-px w-16 bg-trail' aria-hidden='true' />
        </div>
        <section className='rounded-xl bg-raised p-6 shadow-[inset_0_0_0_1px_var(--line-faint)]'>
          <h1 className='text-lg font-semibold tracking-[-0.01em] text-ink'>
            {title}
          </h1>
          {description ? (
            <p className='mt-1 text-sm text-pretty text-ink-3'>{description}</p>
          ) : null}
          <div className='mt-5'>{children}</div>
        </section>
        {footer ? (
          <p className='mt-5 px-4 text-center text-xs text-pretty text-ink-3'>
            {footer}
          </p>
        ) : null}
      </div>
    </main>
  )
}
