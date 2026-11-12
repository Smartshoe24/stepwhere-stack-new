import { useEffect, useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { Search } from '@/components/search'
import { Breadcrumbs } from './breadcrumbs'

type HeaderProps = {
  /** Replaces the auto breadcrumbs (rarely needed). */
  title?: ReactNode
  className?: string
}

/**
 * The single app top bar: sidebar toggle, breadcrumbs, ⌘K search. Rendered by
 * the authenticated layout, so pages no longer compose their own header.
 */
export function Header({ title, className }: HeaderProps) {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => {
      setScrolled(
        (document.body.scrollTop || document.documentElement.scrollTop) > 4
      )
    }
    document.addEventListener('scroll', onScroll, { passive: true })
    return () => document.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header
      className={cn(
        'header-fixed peer/header sticky top-0 z-40 h-12 w-[inherit] border-b transition-[background-color,border-color] duration-150',
        scrolled
          ? 'border-line-faint bg-canvas/80 backdrop-blur-md'
          : 'border-line-faint bg-canvas',
        className
      )}
    >
      <div className='flex h-full items-center gap-3 px-4 sm:px-5'>
        <SidebarTrigger
          variant='ghost'
          className='-ms-1.5 size-7 text-ink-3 md:hidden'
        />
        <div className='min-w-0 flex-1'>{title ?? <Breadcrumbs />}</div>
        <Search className='w-auto sm:w-64' />
      </div>
    </header>
  )
}
