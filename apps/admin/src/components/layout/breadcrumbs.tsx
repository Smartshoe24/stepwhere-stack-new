import { Link, useLocation } from '@tanstack/react-router'
import { ChevronRight } from 'lucide-react'
import { sidebarData } from './data/sidebar-data'

const sectionTitles = new Map(
  sidebarData.navGroups.flatMap((group) =>
    group.items
      .filter((item) => item.url)
      .map((item) => [
        String(item.url),
        { title: item.title, group: group.title },
      ])
  )
)

/** Section › record, derived from the URL. Detail pages show the ID in mono. */
export function Breadcrumbs() {
  const pathname = useLocation({ select: (location) => location.pathname })
  const [, first, second] = pathname.split('/')
  const sectionUrl = first ? `/${first}` : '/'
  const section = sectionTitles.get(sectionUrl)

  if (!section) {
    return <span className='text-sm font-medium text-ink'>Stepwhere Admin</span>
  }

  return (
    <nav
      aria-label='Breadcrumb'
      className='flex min-w-0 items-center gap-1.5 text-sm'
    >
      {second ? (
        <>
          <Link
            to={sectionUrl}
            className='focus-trail truncate rounded-xs text-ink-3 transition-colors hover:text-ink'
          >
            {section.title}
          </Link>
          <ChevronRight
            aria-hidden='true'
            className='size-3.5 shrink-0 text-ink-4'
          />
          <span
            aria-current='page'
            className='truncate font-mono text-xs font-medium text-ink'
            title={decodeURIComponent(second)}
          >
            {decodeURIComponent(second)}
          </span>
        </>
      ) : (
        <>
          <span className='hidden text-ink-3 sm:inline'>{section.group}</span>
          <ChevronRight
            aria-hidden='true'
            className='hidden size-3.5 shrink-0 text-ink-4 sm:inline'
          />
          <span aria-current='page' className='truncate font-medium text-ink'>
            {section.title}
          </span>
        </>
      )}
    </nav>
  )
}
