import { Link } from '@tanstack/react-router'
import { type ColumnDef } from '@tanstack/react-table'
import type { AdminChildListItemDto } from '@stepwhere/types'
import { formatAdminDateTime } from '@/lib/date-format'
import { AdminLastSeen } from '@/features/admin/components/admin-last-seen'
import { RecordPreviewLink } from '@/features/admin/components/record-preview-link'
import {
  ChildLifecycleBadge,
  ChildTrackingBadge,
  TelemetryStateBadge,
} from '@/features/admin/components/status-badge'
import { Checkbox } from '@/components/ui/checkbox'
import { DataTableColumnHeader } from '@/components/data-table'

type ChildrenColumnsOptions = {
  onView: (child: AdminChildListItemDto) => void
  onBind: (child: AdminChildListItemDto) => void
  onUnbind: (child: AdminChildListItemDto) => void
}

export function getChildrenColumns({
  onView,
  onBind,
  onUnbind,
}: ChildrenColumnsOptions): ColumnDef<AdminChildListItemDto>[] {
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
      accessorKey: 'name',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Child' />
      ),
      cell: ({ row }) => (
        <div className='min-w-44'>
          <Link
            to='/children/$childId'
            params={{ childId: row.original.id }}
            className='font-medium underline decoration-line-strong underline-offset-[3px]'
          >
            {row.original.name}
          </Link>
          <div className='text-xs text-ink-3'>
            {row.original.schoolName ?? 'No school'}
          </div>
        </div>
      ),
      enableHiding: false,
    },
    {
      id: 'parent',
      accessorFn: (row) => row.parent?.displayName ?? '',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Parent user' />
      ),
      cell: ({ row }) =>
        row.original.parent ? (
          <RecordPreviewLink
            type='user'
            id={row.original.parent.id}
            label={row.original.parent.displayName}
          />
        ) : (
          <span className='text-sm text-ink-3'>No parent user</span>
        ),
    },
    {
      id: 'lifecycleStatus',
      accessorFn: (row) => row.lifecycleStatus,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Lifecycle' />
      ),
      cell: ({ row }) => (
        <ChildLifecycleBadge status={row.original.lifecycleStatus} />
      ),
      enableSorting: false,
      filterFn: (row, id, value) => value.includes(row.getValue(id)),
    },
    {
      accessorKey: 'summary.status',
      id: 'trackingStatus',
      accessorFn: (row) => row.summary.status,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Tracking status' />
      ),
      cell: ({ row }) => (
        <ChildTrackingBadge status={row.original.summary.status} />
      ),
      enableSorting: false,
      filterFn: (row, id, value) => value.includes(row.getValue(id)),
    },
    {
      id: 'telemetryState',
      accessorFn: (row) => row.summary.telemetryState,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Telemetry' />
      ),
      cell: ({ row }) => (
        <TelemetryStateBadge state={row.original.summary.telemetryState} />
      ),
      enableSorting: false,
      filterFn: (row, id, value) => value.includes(row.getValue(id)),
    },
    {
      id: 'binding',
      accessorFn: (row) =>
        row.summary.deviceSummary?.id ? 'bound' : 'unbound',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Active device' />
      ),
      cell: ({ row }) =>
        row.original.summary.deviceSummary?.id ? (
          <RecordPreviewLink
            type='device'
            id={row.original.summary.deviceSummary.id}
            label={
              row.original.summary.deviceSummary.hardwareIdentifier ?? 'Unknown'
            }
          />
        ) : (
          <span className='text-sm text-ink-3'>No active device</span>
        ),
      enableSorting: false,
      filterFn: (row, id, value) => value.includes(row.getValue(id)),
    },
    {
      id: 'plan',
      accessorFn: (row) => row.summary.activePlan?.plan.title ?? '',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Plan' />
      ),
      cell: ({ row }) => (
        <span className='text-sm'>
          {row.original.summary.activePlan?.plan.title ?? 'No active plan'}
        </span>
      ),
      enableSorting: false,
    },
    {
      accessorKey: 'summary.lastSeenAt',
      id: 'lastSeenAt',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Last seen' />
      ),
      cell: ({ row }) => (
        <div className='space-y-1 text-sm text-ink-3'>
          <AdminLastSeen value={row.original.summary.lastSeenAt} />
          {row.original.summary.lastSeenAt ? (
            <div className='text-xs'>
              {formatAdminDateTime(row.original.summary.lastSeenAt)}
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
        <span className='text-sm text-ink-3'>
          {formatAdminDateTime(row.original.createdAt)}
        </span>
      ),
    },
    {
      id: 'actions',
      cell: ({ row }) => (
        <div className='flex gap-2'>
          <button
            type='button'
            className='text-sm underline decoration-line-strong underline-offset-[3px]'
            onClick={() => onView(row.original)}
          >
            View
          </button>
          <button
            type='button'
            className='text-sm underline decoration-line-strong underline-offset-[3px]'
            onClick={() =>
              row.original.summary.deviceSummary?.id
                ? onUnbind(row.original)
                : onBind(row.original)
            }
          >
            {row.original.summary.deviceSummary?.id ? 'Unbind' : 'Bind'}
          </button>
        </div>
      ),
      enableSorting: false,
      enableHiding: false,
    },
  ]
}
