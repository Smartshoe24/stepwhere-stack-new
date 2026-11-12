import { Link } from '@tanstack/react-router'
import { type ColumnDef } from '@tanstack/react-table'
import type { AdminUserListItemDto } from '@stepwhere/types'
import { formatAdminDateTime } from '@/lib/date-format'
import { AdminLastSeen } from '@/features/admin/components/admin-last-seen'
import { RecordPreviewLink } from '@/features/admin/components/record-preview-link'
import {
  BanStateBadge,
  UserRoleBadge,
  UserStatusBadge,
} from '@/features/admin/components/status-badge'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { DataTableColumnHeader } from '@/components/data-table'
import { LongText } from '@/components/long-text'
import { AdminUserRowActions } from './admin-user-row-actions'

type AdminUsersColumnsOptions = {
  onEdit: (user: AdminUserListItemDto) => void
  onBan: (user: AdminUserListItemDto) => void
  onView: (user: AdminUserListItemDto) => void
}

export function getAdminUsersColumns({
  onEdit,
  onBan,
  onView,
}: AdminUsersColumnsOptions): ColumnDef<AdminUserListItemDto>[] {
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
          className='translate-y-0.5'
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label='Select row'
          className='translate-y-0.5'
        />
      ),
      enableSorting: false,
      enableHiding: false,
    },
    {
      accessorKey: 'displayName',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Name' />
      ),
      cell: ({ row }) => (
        <div className='min-w-44'>
          <Link
            to='/users/$userId'
            params={{ userId: row.original.id }}
            className='font-medium underline decoration-line-strong underline-offset-[3px]'
          >
            <LongText>{row.original.displayName}</LongText>
          </Link>
          <div className='text-xs text-ink-3'>
            {row.original.id.slice(0, 8)}
          </div>
        </div>
      ),
      enableHiding: false,
    },
    {
      accessorKey: 'phoneNumber',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Phone' />
      ),
      cell: ({ row }) => (
        <div className='text-sm'>{row.original.phoneNumber}</div>
      ),
    },
    {
      accessorKey: 'email',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Email' />
      ),
      cell: ({ row }) => (
        <LongText className='max-w-52'>
          {row.original.email ?? 'No email'}
        </LongText>
      ),
    },
    {
      accessorKey: 'role',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Role' />
      ),
      cell: ({ row }) => <UserRoleBadge role={row.original.role} />,
      filterFn: (row, id, value) => value.includes(row.getValue(id)),
      enableSorting: false,
    },
    {
      accessorKey: 'status',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Status' />
      ),
      cell: ({ row }) => <UserStatusBadge status={row.original.status} />,
      filterFn: (row, id, value) => value.includes(row.getValue(id)),
      enableSorting: false,
    },
    {
      id: 'banState',
      accessorFn: (row) => (row.banned ? 'banned' : 'not_banned'),
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Ban state' />
      ),
      cell: ({ row }) => {
        const user = row.original
        return user.banned ? (
          <div className='min-w-44'>
            <BanStateBadge banned />
            <div className='mt-1 text-xs text-ink-3'>
              {user.banExpires
                ? `Until ${formatAdminDateTime(user.banExpires)}`
                : 'No expiry'}
            </div>
          </div>
        ) : (
          <BanStateBadge banned={false} />
        )
      },
      filterFn: (row, id, value) => value.includes(row.getValue(id)),
      enableSorting: false,
    },
    {
      id: 'family',
      accessorFn: (row) => row.family.organization?.name ?? 'No family',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Family' />
      ),
      cell: ({ row }) => (
        <div className='min-w-40'>
          {row.original.family.organization ? (
            <RecordPreviewLink
              type='family'
              id={row.original.family.organization.id}
              label={row.original.family.organization.name}
            />
          ) : (
            <LongText>No family</LongText>
          )}
          <div className='text-xs text-ink-3'>
            {row.original.family.memberRole ?? 'No role'}
          </div>
        </div>
      ),
    },
    {
      id: 'children',
      accessorFn: (row) => row.childRelationship.count,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Children' />
      ),
      cell: ({ row }) => {
        const { childRelationship } = row.original

        if (childRelationship.count === 0) {
          return <span className='text-sm text-ink-3'>No children</span>
        }

        const remaining =
          childRelationship.count - childRelationship.previewChildren.length

        return (
          <div className='min-w-52 space-y-1'>
            <div className='text-sm font-medium'>
              {childRelationship.count} child
              {childRelationship.count === 1 ? '' : 'ren'}
            </div>
            <div className='flex flex-wrap gap-x-3 gap-y-1 text-sm text-ink-3'>
              {childRelationship.previewChildren.map((child) => (
                <RecordPreviewLink
                  key={child.id}
                  type='child'
                  id={child.id}
                  label={child.name}
                />
              ))}
              {remaining > 0 ? <span>+{remaining} more</span> : null}
            </div>
          </div>
        )
      },
      enableSorting: false,
    },
    {
      id: 'onboarding',
      accessorFn: (row) =>
        row.onboardingCompleted ? 'completed' : 'incomplete',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Onboarding' />
      ),
      cell: ({ row }) => (
        <Badge variant='outline'>
          {row.original.onboardingCompleted ? 'Completed' : 'Incomplete'}
        </Badge>
      ),
      filterFn: (row, id, value) => value.includes(row.getValue(id)),
      enableSorting: false,
    },
    {
      accessorKey: 'lastSeenAt',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Last seen' />
      ),
      cell: ({ row }) => (
        <div className='space-y-1 text-sm text-ink-3'>
          <AdminLastSeen value={row.original.lastSeenAt} />
          {row.original.lastSeenAt ? (
            <div className='text-xs'>
              {formatAdminDateTime(row.original.lastSeenAt)}
            </div>
          ) : null}
        </div>
      ),
    },
    {
      accessorKey: 'createdAt',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Created' />
      ),
      cell: ({ row }) => (
        <div className='text-sm text-ink-3'>
          {formatAdminDateTime(row.original.createdAt)}
        </div>
      ),
    },
    {
      id: 'actions',
      cell: ({ row }) => (
        <AdminUserRowActions
          user={row.original}
          onEdit={onEdit}
          onBan={onBan}
          onView={onView}
        />
      ),
    },
  ]
}
