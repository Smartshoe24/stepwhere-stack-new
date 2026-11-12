import type { AdminUserListItemDto } from '@stepwhere/types'
import { MoreHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

type AdminUserRowActionsProps = {
  user: AdminUserListItemDto
  onEdit: (user: AdminUserListItemDto) => void
  onBan: (user: AdminUserListItemDto) => void
  onView: (user: AdminUserListItemDto) => void
}

export function AdminUserRowActions({
  user,
  onEdit,
  onBan,
  onView,
}: AdminUserRowActionsProps) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant='ghost' size='icon' className='size-8'>
          <MoreHorizontal />
          <span className='sr-only'>Open actions</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end' className='w-44'>
        <DropdownMenuItem onClick={() => onView(user)}>
          View details
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onEdit(user)}>
          Edit access
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => onBan(user)}>
          {user.banned ? 'Unban user' : 'Ban user'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
