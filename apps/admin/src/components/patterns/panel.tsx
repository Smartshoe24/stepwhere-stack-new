import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** A raised section with an optional header row. The base container for detail pages. */
export function Panel({
  title,
  description,
  actions,
  children,
  className,
  bodyClassName,
  flush,
}: {
  title?: ReactNode
  description?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
  /** Remove body padding (tables, maps). */
  flush?: boolean
}) {
  return (
    <section
      className={cn(
        'min-w-0 overflow-hidden rounded-lg bg-raised shadow-[inset_0_0_0_1px_var(--line-faint)]',
        className
      )}
    >
      {title || actions ? (
        <header className='flex min-h-10 items-center justify-between gap-3 border-b border-line-faint px-4 py-2.5'>
          <div className='min-w-0'>
            {title ? (
              <h2 className='text-sm font-semibold text-ink'>{title}</h2>
            ) : null}
            {description ? (
              <p className='mt-0.5 text-xs text-pretty text-ink-3'>
                {description}
              </p>
            ) : null}
          </div>
          {actions ? (
            <div className='flex shrink-0 items-center gap-2'>{actions}</div>
          ) : null}
        </header>
      ) : null}
      <div className={cn(!flush && 'p-4', bodyClassName)}>{children}</div>
    </section>
  )
}
