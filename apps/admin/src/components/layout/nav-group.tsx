import { Link, useLocation } from '@tanstack/react-router'
import { ChevronRight } from 'lucide-react'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from '@/components/ui/sidebar'
import {
  type NavCollapsible,
  type NavItem,
  type NavLink,
  type NavGroup as NavGroupProps,
} from './types'

export function NavGroup({ title, items }: NavGroupProps) {
  const { state, isMobile } = useSidebar()
  const pathname = useLocation({ select: (location) => location.pathname })
  return (
    <SidebarGroup className='py-1'>
      <SidebarGroupLabel>{title}</SidebarGroupLabel>
      <SidebarMenu>
        {items.map((item) => {
          const key = `${item.title}-${item.url}`

          if (!item.items)
            return <SidebarMenuLink key={key} item={item} pathname={pathname} />

          if (state === 'collapsed' && !isMobile)
            return (
              <SidebarMenuCollapsedDropdown
                key={key}
                item={item}
                pathname={pathname}
              />
            )

          return (
            <SidebarMenuCollapsible key={key} item={item} pathname={pathname} />
          )
        })}
      </SidebarMenu>
    </SidebarGroup>
  )
}

function NavCount({ item }: { item: NavItem }) {
  if (item.alert) {
    return (
      <span
        data-slot='nav-alert'
        className='ms-auto inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-breach-wash px-1.5 text-2xs font-semibold text-breach tabular-nums group-data-[collapsible=icon]:absolute group-data-[collapsible=icon]:end-1 group-data-[collapsible=icon]:top-1 group-data-[collapsible=icon]:size-[7px] group-data-[collapsible=icon]:min-w-0 group-data-[collapsible=icon]:bg-breach group-data-[collapsible=icon]:p-0 group-data-[collapsible=icon]:text-[0px]'
        aria-label={`${item.alert} need attention`}
      >
        {item.alert}
      </span>
    )
  }
  if (item.badge) {
    return (
      <span className='ms-auto text-2xs text-ink-3 tabular-nums group-data-[collapsible=icon]:hidden'>
        {item.badge}
      </span>
    )
  }
  return null
}

function SidebarMenuLink({
  item,
  pathname,
}: {
  item: NavLink
  pathname: string
}) {
  const { setOpenMobile } = useSidebar()
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        isActive={checkIsActive(pathname, item)}
        tooltip={item.title}
      >
        <Link to={item.url} onClick={() => setOpenMobile(false)}>
          {item.icon && <item.icon />}
          <span>{item.title}</span>
          <NavCount item={item} />
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}

function SidebarMenuCollapsible({
  item,
  pathname,
}: {
  item: NavCollapsible
  pathname: string
}) {
  const { setOpenMobile } = useSidebar()
  return (
    <Collapsible
      asChild
      defaultOpen={checkIsActive(pathname, item)}
      className='group/collapsible'
    >
      <SidebarMenuItem>
        <CollapsibleTrigger asChild>
          <SidebarMenuButton tooltip={item.title}>
            {item.icon && <item.icon />}
            <span>{item.title}</span>
            <NavCount item={item} />
            <ChevronRight className='ms-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90' />
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <CollapsibleContent className='CollapsibleContent'>
          <SidebarMenuSub>
            {item.items.map((subItem) => (
              <SidebarMenuSubItem key={subItem.title}>
                <SidebarMenuSubButton
                  asChild
                  isActive={checkIsActive(pathname, subItem)}
                >
                  <Link to={subItem.url} onClick={() => setOpenMobile(false)}>
                    {subItem.icon && <subItem.icon />}
                    <span>{subItem.title}</span>
                  </Link>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            ))}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  )
}

function SidebarMenuCollapsedDropdown({
  item,
  pathname,
}: {
  item: NavCollapsible
  pathname: string
}) {
  return (
    <SidebarMenuItem>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <SidebarMenuButton
            tooltip={item.title}
            isActive={checkIsActive(pathname, item)}
          >
            {item.icon && <item.icon />}
            <span>{item.title}</span>
            <NavCount item={item} />
          </SidebarMenuButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent side='right' align='start' sideOffset={8}>
          <DropdownMenuLabel>{item.title}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {item.items.map((sub) => (
            <DropdownMenuItem key={`${sub.title}-${sub.url}`} asChild>
              <Link
                to={sub.url}
                data-active={checkIsActive(pathname, sub) || undefined}
                className='data-[active]:text-here'
              >
                {sub.icon && <sub.icon />}
                <span className='max-w-52 text-wrap'>{sub.title}</span>
              </Link>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarMenuItem>
  )
}

/**
 * Active when the path is the item's route or nested under it, so detail
 * pages like /devices/123 keep "Devices" highlighted. "/" only matches itself.
 */
function checkIsActive(pathname: string, item: NavItem | NavLink): boolean {
  if (item.items) {
    return item.items.some((sub) => checkIsActive(pathname, sub as NavLink))
  }
  const url = String(item.url ?? '')
  if (!url) return false
  if (url === '/' || item.exact) return pathname === url
  return pathname === url || pathname.startsWith(`${url}/`)
}
