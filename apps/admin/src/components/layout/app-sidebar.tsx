import { Link } from '@tanstack/react-router'
import { PanelLeft } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { getAdminGeofenceBreachCounts } from '@/lib/api-client'
import { useSessionQuery } from '@/features/auth/session'
import { adminQueryKeys } from '@/features/admin/query-keys'
import { Emblem, Wordmark } from '@/assets/brand'
import { Button } from '@/components/ui/button'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
  useSidebar,
} from '@/components/ui/sidebar'
import {
  getSidebarUser,
  NAV_GEOFENCES_URL,
  sidebarData,
} from './data/sidebar-data'
import { NavGroup } from './nav-group'
import { NavUser } from './nav-user'

export function AppSidebar() {
  const sessionQuery = useSessionQuery()
  const currentUser = getSidebarUser(sessionQuery.data?.user)
  const { toggleSidebar } = useSidebar()
  const breachCountsQuery = useQuery({
    queryKey: adminQueryKeys.geofences.breachCounts(),
    queryFn: getAdminGeofenceBreachCounts,
    staleTime: 30_000,
  })
  const unacknowledged = breachCountsQuery.data?.unacknowledged ?? 0
  const navGroups = sidebarData.navGroups.map((group) => ({
    ...group,
    items: group.items.map((item) =>
      item.url === NAV_GEOFENCES_URL && unacknowledged > 0
        ? { ...item, alert: String(unacknowledged) }
        : item
    ),
  }))

  return (
    <Sidebar collapsible='icon' variant='sidebar'>
      <SidebarHeader className='h-12 flex-row items-center justify-between px-3 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0'>
        <Link
          to='/'
          className='focus-trail flex items-center rounded-xs px-1 py-1'
          aria-label='Stepwhere Admin home'
        >
          <Wordmark className='h-3 group-data-[collapsible=icon]:hidden' />
          <Emblem className='hidden h-[22px] group-data-[collapsible=icon]:block' />
        </Link>
        <Button
          variant='ghost'
          size='icon'
          className='size-7 group-data-[collapsible=icon]:hidden'
          onClick={toggleSidebar}
          aria-label='Collapse sidebar'
        >
          <PanelLeft className='size-3.5' />
        </Button>
      </SidebarHeader>
      <SidebarContent className='gap-1 px-1'>
        {navGroups.map((props) => (
          <NavGroup key={props.title} {...props} />
        ))}
      </SidebarContent>
      <SidebarFooter className='border-t border-line-faint'>
        <NavUser user={currentUser} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
