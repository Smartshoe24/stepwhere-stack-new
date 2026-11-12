import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { ArrowLeft, RefreshCcw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

type PageHeaderProps = {
  title: ReactNode
  description?: ReactNode
  /** Rendered next to the title, e.g. status pills or a Live badge. */
  meta?: ReactNode
  /** Leading glyph (detail pages). */
  icon?: ReactNode
  /** Right-aligned actions; put at most one primary button here. */
  actions?: ReactNode
  backTo?: string
  backLabel?: string
  onRefresh?: () => void
  refreshing?: boolean
  className?: string
}

/** Page title block shared by list and detail pages. */
export function PageHeader({
  title,
  description,
  meta,
  icon,
  actions,
  backTo,
  backLabel = 'Back',
  onRefresh,
  refreshing,
  className,
}: PageHeaderProps) {
  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {backTo ? (
        <Button asChild variant='ghost' size='sm' className='-ms-2 w-fit'>
          <Link to={backTo}>
            <ArrowLeft />
            {backLabel}
          </Link>
        </Button>
      ) : null}
      <div className='flex flex-wrap items-end justify-between gap-x-4 gap-y-3'>
        <div className='flex min-w-0 items-start gap-4'>
          {icon ? (
            <span className='grid size-11 shrink-0 place-items-center rounded-lg bg-raised text-ink-2 shadow-[inset_0_0_0_1px_var(--line)] [&_svg]:size-5'>
              {icon}
            </span>
          ) : null}
          <div className='min-w-0'>
            <div className='flex flex-wrap items-center gap-x-3 gap-y-1.5'>
              <h1 className='text-xl font-semibold tracking-[-0.015em] text-ink'>
                {title}
              </h1>
              {meta}
            </div>
            {description ? (
              <div className='mt-1 max-w-3xl text-sm text-pretty text-ink-3'>
                {description}
              </div>
            ) : null}
          </div>
        </div>
        {actions || onRefresh ? (
          <div className='flex flex-wrap items-center gap-2'>
            {onRefresh ? (
              <Button
                variant='outline'
                onClick={onRefresh}
                disabled={refreshing}
              >
                <RefreshCcw className={cn(refreshing && 'animate-spin')} />
                Refresh
              </Button>
            ) : null}
            {actions}
          </div>
        ) : null}
      </div>
    </div>
  )
}

/** Inline metadata row under a detail title: values separated by dots. */
export function MetaRow({ children }: { children: ReactNode[] }) {
  const items = children.filter(Boolean)
  return (
    <div className='flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-3'>
      {items.map((item, index) => (
        <span key={index} className='flex items-center gap-3'>
          {index > 0 ? (
            <span
              aria-hidden='true'
              className='size-[3px] rounded-full bg-ink-4'
            />
          ) : null}
          {item}
        </span>
      ))}
    </div>
  )
}
