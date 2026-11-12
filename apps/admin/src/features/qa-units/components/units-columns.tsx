import { Link } from '@tanstack/react-router'
import { type ColumnDef } from '@tanstack/react-table'
import type { QaUnitListItemDto } from '@stepwhere/types'
import { AdminLastSeen } from '@/features/admin/components/admin-last-seen'
import { DataTableColumnHeader } from '@/components/data-table'
import { shortChipUid, stageLabels, unitTitle } from '../lib/qa-unit-format'
import { FirmwareChannelTag, StageBar, UnitStatusBadge } from './stage-display'

export function getUnitsColumns(): ColumnDef<QaUnitListItemDto>[] {
  return [
    {
      accessorKey: 'imei',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Unit' />
      ),
      cell: ({ row }) => (
        <div className='min-w-40'>
          <Link
            to='/qa/units/$unitId'
            params={{ unitId: row.original.id }}
            className='focus-trail rounded-xs font-mono text-xs font-medium text-ink transition-colors hover:text-act'
          >
            {unitTitle(row.original)}
          </Link>
          <div className='mt-0.5 font-mono text-2xs text-ink-4 tabular'>
            {row.original.imei
              ? `chip …${shortChipUid(row.original.chipUid)}`
              : 'IMEI not read yet'}
          </div>
        </div>
      ),
      enableHiding: false,
    },
    {
      accessorKey: 'stage',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Stage' />
      ),
      cell: ({ row }) => (
        <div className='flex min-w-52 items-center gap-3'>
          <StageBar
            stage={row.original.stage}
            stageStatus={row.original.stageStatus}
          />
          <span className='text-sm text-ink-2'>
            {stageLabels[row.original.stage]}
          </span>
        </div>
      ),
    },
    {
      id: 'status',
      accessorKey: 'stageStatus',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Status' />
      ),
      cell: ({ row }) => <UnitStatusBadge unit={row.original} />,
      enableSorting: false,
    },
    {
      id: 'firmware',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Firmware' />
      ),
      cell: ({ row }) =>
        row.original.firmwareFileName ? (
          <div className='flex min-w-0 items-center gap-1.5'>
            <FirmwareChannelTag channel={row.original.firmwareChannel} />
            <span className='truncate font-mono text-xs text-ink-2'>
              {row.original.firmwareVersion ?? row.original.firmwareFileName}
            </span>
          </div>
        ) : (
          <span className='text-ink-4'>—</span>
        ),
      enableSorting: false,
    },
    {
      id: 'station',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Station' />
      ),
      cell: ({ row }) => (
        <span className='text-sm text-ink-2'>
          {row.original.lastStationName ?? (
            <span className='text-ink-4'>—</span>
          )}
        </span>
      ),
      enableSorting: false,
    },
    {
      accessorKey: 'updatedAt',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Updated' />
      ),
      cell: ({ row }) => (
        <AdminLastSeen
          value={row.original.updatedAt}
          className='text-sm text-ink-3'
        />
      ),
    },
  ]
}
