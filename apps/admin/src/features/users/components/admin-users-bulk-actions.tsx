import { Download } from 'lucide-react'
import { type Table } from '@tanstack/react-table'
import type { AdminUserListItemDto } from '@stepwhere/types'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { DataTableBulkActions } from '@/components/data-table'
import { downloadUsersCsv } from '../data/admin-user-options'

type AdminUsersBulkActionsProps = {
  table: Table<AdminUserListItemDto>
}

export function AdminUsersBulkActions({
  table,
}: AdminUsersBulkActionsProps) {
  const selectedUsers = table
    .getFilteredSelectedRowModel()
    .rows.map((row) => row.original)

  if (selectedUsers.length === 0) {
    return null
  }

  return (
    <DataTableBulkActions table={table} entityName='user'>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant='outline'
            size='icon'
            className='size-8'
            onClick={() => downloadUsersCsv(selectedUsers)}
          >
            <Download />
            <span className='sr-only'>Export selected users</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>Export selected users</p>
        </TooltipContent>
      </Tooltip>
    </DataTableBulkActions>
  )
}
