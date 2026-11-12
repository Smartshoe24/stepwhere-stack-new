import { Link } from '@tanstack/react-router'
import { type ColumnDef } from '@tanstack/react-table'
import type { AdminFamilyListItemDto } from '@stepwhere/types'
import { formatAdminDateTime } from '@/lib/date-format'
import { RecordPreviewLink } from '@/features/admin/components/record-preview-link'
import { Checkbox } from '@/components/ui/checkbox'
import { DataTableColumnHeader } from '@/components/data-table'

export function getFamiliesColumns({
  onView,
}: {
  onView: (family: AdminFamilyListItemDto) => void
}): ColumnDef<AdminFamilyListItemDto>[] {
  return [
    {
      id: 'select',
      header: ({ table }) => (
        <Checkbox
          checked={
            table.getIsAllPageRowsSelected() ||
            (table.getIsSomePageRowsSelected() && 'indeterminate')
          }
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label='Select all'
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label='Select row'
        />
      ),
      enableSorting: false,
      enableHiding: false,
    },
    {
      accessorKey: 'familyName',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Family' />
      ),
      cell: ({ row }) => (
        <div className='min-w-44'>
          <Link
            to='/families/$familyId'
            params={{ familyId: row.original.id }}
            className='font-medium underline decoration-line-strong underline-offset-[3px]'
          >
            {row.original.familyName ?? row.original.name}
          </Link>
          <div className='text-xs text-ink-3'>{row.original.slug}</div>
        </div>
      ),
      enableHiding: false,
    },
    {
      id: 'admin',
      accessorFn: (row) => row.admin?.displayName ?? '',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Admin' />
      ),
      cell: ({ row }) =>
        row.original.admin ? (
          <RecordPreviewLink
            type='user'
            id={row.original.admin.id}
            label={row.original.admin.displayName}
          />
        ) : (
          <span className='text-sm text-ink-3'>No admin</span>
        ),
    },
    {
      accessorKey: 'memberCount',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Members' />
      ),
      cell: ({ row }) => (
        <span className='text-sm'>{row.original.memberCount}</span>
      ),
      enableSorting: false,
    },
    {
      accessorKey: 'childCount',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Children' />
      ),
      cell: ({ row }) => (
        <span className='text-sm'>{row.original.childCount}</span>
      ),
      enableSorting: false,
    },
    {
      accessorKey: 'activeJoinCodeCount',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Join codes' />
      ),
      cell: ({ row }) => (
        <span className='text-sm'>{row.original.activeJoinCodeCount}</span>
      ),
      enableSorting: false,
    },
    {
      accessorKey: 'createdAt',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Created' />
      ),
      cell: ({ row }) => (
        <span className='text-sm text-ink-3'>
          {formatAdminDateTime(row.original.createdAt)}
        </span>
      ),
    },
    {
      id: 'actions',
      cell: ({ row }) => (
        <button
          type='button'
          className='text-sm underline decoration-line-strong underline-offset-[3px]'
          onClick={() => onView(row.original)}
        >
          View
        </button>
      ),
      enableSorting: false,
      enableHiding: false,
    },
  ]
}
