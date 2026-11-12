import { Link } from '@tanstack/react-router'
import { type ColumnDef } from '@tanstack/react-table'
import type { AdminDeviceListItemDto } from '@stepwhere/types'
import { CopyableId } from '@/features/admin/components/copyable-id'
import { LastSeenFreshness } from '@/features/admin/components/admin-last-seen'
import { RecordPreviewLink } from '@/features/admin/components/record-preview-link'
import {
  DevicePlatformBadge,
  DeviceStatusBadge,
} from '@/features/admin/components/status-badge'
import { Checkbox } from '@/components/ui/checkbox'
import { DataTableColumnHeader } from '@/components/data-table'
import { LongText } from '@/components/long-text'
import { formatAdminDateTime } from '@/lib/date-format'
import { DeviceRowActions } from './device-row-actions'
import {
  LiveDeviceConnectionBadge,
  TelemetryReliabilityCell,
} from './telemetry-reliability'

type DevicesColumnsOptions = {
  onEdit: (device: AdminDeviceListItemDto) => void
  onBind: (device: AdminDeviceListItemDto) => void
  onShowQr: (device: AdminDeviceListItemDto) => void
  onView: (device: AdminDeviceListItemDto) => void
  onToggleBlocked: (device: AdminDeviceListItemDto) => void
  onUnbind: (device: AdminDeviceListItemDto) => void
}

export function getDevicesColumns({
  onEdit,
  onBind,
  onShowQr,
  onView,
  onToggleBlocked,
  onUnbind,
}: DevicesColumnsOptions): ColumnDef<AdminDeviceListItemDto>[] {
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
      accessorKey: 'hardwareIdentifier',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Hardware ID' />
      ),
      cell: ({ row }) => (
        <div className='min-w-44'>
          <Link
            to='/devices/$deviceId'
            params={{ deviceId: row.original.id }}
            className='focus-trail rounded-xs font-mono text-xs font-medium text-ink transition-colors group-data-[state=selected]/row:text-here hover:text-act'
          >
            <LongText>{row.original.hardwareIdentifier}</LongText>
          </Link>
          <div className='mt-1'>
            <CopyableId value={row.original.id} copyLabel='device ID' />
          </div>
        </div>
      ),
      enableHiding: false,
    },
    {
      accessorKey: 'displayName',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Display name' />
      ),
      cell: ({ row }) => (
        <LongText
          className={
            row.original.displayName
              ? 'max-w-40 text-ink-2'
              : 'max-w-40 text-ink-3'
          }
        >
          {row.original.displayName ?? 'No label'}
        </LongText>
      ),
    },
    {
      accessorKey: 'platform',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Platform' />
      ),
      cell: ({ row }) => (
        <DevicePlatformBadge platform={row.original.platform} />
      ),
      filterFn: (row, id, value) => value.includes(row.getValue(id)),
      enableSorting: false,
    },
    {
      accessorKey: 'status',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Provisioning' />
      ),
      cell: ({ row }) => <DeviceStatusBadge status={row.original.status} />,
      filterFn: (row, id, value) => value.includes(row.getValue(id)),
      enableSorting: false,
    },
    {
      id: 'connection',
      header: 'Connection',
      cell: ({ row }) => <LiveDeviceConnectionBadge device={row.original} />,
      enableSorting: false,
      filterFn: (row, id, value) => value.includes(row.getValue(id)),
    },
    {
      id: 'binding',
      accessorFn: (row) => (row.activeBinding ? 'bound' : 'unbound'),
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Bound child' />
      ),
      cell: ({ row }) =>
        row.original.activeBinding ? (
          <div className='min-w-40'>
            <RecordPreviewLink
              type='child'
              id={row.original.activeBinding.childId}
              label={row.original.activeBinding.childName}
            />
            <div className='text-xs text-ink-3'>
              Bound {formatAdminDateTime(row.original.activeBinding.boundAt)}
            </div>
          </div>
        ) : (
          <div className='text-sm text-ink-3'>Unbound</div>
        ),
      filterFn: (row, id, value) => value.includes(row.getValue(id)),
      enableSorting: false,
    },
    {
      id: 'reservation',
      accessorFn: (row) =>
        row.reservation.reservedUntil ? 'reserved' : 'unreserved',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Reservation' />
      ),
      cell: ({ row }) =>
        row.original.reservation.reservedUntil ? (
          <div className='min-w-44'>
            <div className='font-medium text-ink'>Reserved</div>
            <div className='text-xs text-ink-3'>
              Until{' '}
              {formatAdminDateTime(row.original.reservation.reservedUntil)}
            </div>
          </div>
        ) : (
          <div className='text-sm text-ink-3'>Available</div>
        ),
      enableSorting: false,
    },
    {
      id: 'lastSeenAt',
      accessorFn: (row) => row.lastSeenAt,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Last seen' />
      ),
      cell: ({ row }) => <LastSeenFreshness value={row.original.lastSeenAt} />,
    },
    {
      id: 'reliability',
      header: 'Reliability',
      cell: ({ row }) => <TelemetryReliabilityCell device={row.original} />,
      enableSorting: false,
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
        <DeviceRowActions
          device={row.original}
          onEdit={onEdit}
          onBind={onBind}
          onShowQr={onShowQr}
          onView={onView}
          onToggleBlocked={onToggleBlocked}
          onUnbind={onUnbind}
        />
      ),
    },
  ]
}
