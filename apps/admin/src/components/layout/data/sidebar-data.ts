import {
  Baby,
  CircuitBoard,
  Cpu,
  Factory,
  Gauge,
  House,
  KeyRound,
  LayoutDashboard,
  MapPinned,
  Users,
  Wrench,
} from 'lucide-react'
import type { UserProfileDto } from '@stepwhere/types'
import { getDisplayNameInitials } from '@/lib/utils'
import { type SidebarData } from '../types'

export function getSidebarUser(user?: UserProfileDto | null) {
  const displayName = user?.displayName?.trim() || 'Admin'

  return {
    name: displayName,
    email: user?.email ?? user?.phoneNumber ?? 'admin@stepwhere',
    avatar: user?.avatarUrl ?? '',
    initials: getDisplayNameInitials(displayName),
  }
}

/** Nav routes. `geofences` receives a live breach count in AppSidebar. */
export const NAV_GEOFENCES_URL = '/geofences'

export const sidebarData: SidebarData = {
  navGroups: [
    {
      title: 'General',
      items: [{ title: 'Overview', url: '/', icon: LayoutDashboard }],
    },
    {
      title: 'Operations',
      items: [
        { title: 'Devices', url: '/devices', icon: Cpu },
        { title: 'Children', url: '/children', icon: Baby },
        { title: 'Families', url: '/families', icon: House },
        { title: 'Geofences', url: NAV_GEOFENCES_URL, icon: MapPinned },
      ],
    },
    {
      title: 'Production',
      items: [
        {
          title: 'QA',
          icon: Factory,
          items: [
            { title: 'Overview', url: '/qa', icon: Gauge, exact: true },
            { title: 'Units', url: '/qa/units', icon: CircuitBoard },
            { title: 'Bench', url: '/qa/bench', icon: Wrench },
          ],
        },
      ],
    },
    {
      title: 'Access',
      items: [
        { title: 'Users', url: '/users', icon: Users },
        { title: 'Preview access', url: '/preview-access', icon: KeyRound },
      ],
    },
  ],
}
