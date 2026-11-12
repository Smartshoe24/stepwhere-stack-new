import { type LinkProps } from '@tanstack/react-router'

type BaseNavItem = {
  title: string
  /** Neutral count shown on the right (e.g. totals). */
  badge?: string
  /** Attention count shown as a breach pill; collapses to a dot. */
  alert?: string
  icon?: React.ElementType
  /** Only highlight on this exact path, for section index pages like /qa. */
  exact?: boolean
}

type NavLink = BaseNavItem & {
  url: LinkProps['to'] | (string & {})
  items?: never
}

type NavCollapsible = BaseNavItem & {
  items: (BaseNavItem & { url: LinkProps['to'] | (string & {}) })[]
  url?: never
}

type NavItem = NavCollapsible | NavLink

type NavGroup = {
  title: string
  items: NavItem[]
}

type SidebarData = {
  navGroups: NavGroup[]
}

export type { SidebarData, NavGroup, NavItem, NavCollapsible, NavLink }
