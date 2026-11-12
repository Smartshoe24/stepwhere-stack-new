import { ChevronsUpDown, LogOut } from 'lucide-react'
import useDialogState from '@/hooks/use-dialog-state'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar'
import { SignOutDialog } from '@/components/sign-out-dialog'

type NavUserProps = {
  user: {
    name: string
    email: string
    avatar: string
    initials?: string
  }
}

function UserAvatar({
  user,
  className,
}: NavUserProps & { className?: string }) {
  return (
    <Avatar className={className ?? 'size-7'}>
      <AvatarImage src={user.avatar} alt={user.name} />
      <AvatarFallback className='bg-trail text-2xs font-semibold text-on-trail'>
        {user.initials ?? 'AD'}
      </AvatarFallback>
    </Avatar>
  )
}

export function NavUser({ user }: NavUserProps) {
  const { isMobile } = useSidebar()
  const [open, setOpen] = useDialogState()

  return (
    <>
      <SidebarMenu>
        <SidebarMenuItem>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <SidebarMenuButton
                size='lg'
                tooltip={user.name}
                className='data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground'
              >
                <UserAvatar user={user} />
                <div className='grid flex-1 text-start leading-tight'>
                  <span className='truncate text-sm font-medium text-ink'>
                    {user.name}
                  </span>
                  <span className='truncate text-2xs font-normal text-ink-3'>
                    {user.email}
                  </span>
                </div>
                <ChevronsUpDown className='ms-auto size-4' />
              </SidebarMenuButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              className='w-(--radix-dropdown-menu-trigger-width) min-w-56'
              side={isMobile ? 'bottom' : 'right'}
              align='end'
              sideOffset={8}
            >
              <DropdownMenuLabel className='flex items-center gap-2.5 py-2 font-normal tracking-normal normal-case'>
                <UserAvatar user={user} className='size-8' />
                <div className='grid flex-1 text-start leading-tight'>
                  <span className='truncate text-sm font-medium text-ink'>
                    {user.name}
                  </span>
                  <span className='truncate text-xs text-ink-3'>
                    {user.email}
                  </span>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant='destructive'
                onClick={() => setOpen(true)}
              >
                <LogOut />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>

      <SignOutDialog open={!!open} onOpenChange={setOpen} />
    </>
  )
}
