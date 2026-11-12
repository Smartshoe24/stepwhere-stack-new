import { useEffect, useMemo, useState } from 'react'
import { getRouteApi } from '@tanstack/react-router'
import {
  getFacetedRowModel,
  getFacetedUniqueValues,
  type SortingState,
  type VisibilityState,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table'
import type { AdminDeviceListItemDto } from '@stepwhere/types'
import { useTableUrlState } from '@/hooks/use-table-url-state'
import {
  DataTablePagination,
  DataTableToolbar,
  DataTableView,
} from '@/components/data-table'
import {
  deviceBindingOptions,
  deviceConnectionOptions,
  devicePlatformOptions,
  deviceStatusOptions,
} from '../data/device-options'
import { DeviceBulkActions } from './device-bulk-actions'
import { getDevicesColumns } from './devices-columns'

const route = getRouteApi('/_authenticated/devices/')
const deviceSorts = [
  'createdAt',
  'hardwareIdentifier',
  'displayName',
  'status',
  'lastSeenAt',
  'platform',
] as const

type DevicesTableProps = {
  data: AdminDeviceListItemDto[]
  total: number
  onEdit: (device: AdminDeviceListItemDto) => void
  onBind: (device: AdminDeviceListItemDto) => void
  onShowQr: (device: AdminDeviceListItemDto) => void
  onView: (device: AdminDeviceListItemDto) => void
  onToggleBlocked: (device: AdminDeviceListItemDto) => void
  onUnbind: (device: AdminDeviceListItemDto) => void
  onSelectionChange: (devices: AdminDeviceListItemDto[]) => void
  onDownloadSelectedQr: () => void
  onBlockSelected: () => void
  onUnblockSelected: () => void
  onExportSelected: () => void
  loading?: boolean
}

export function DevicesTable({
  data,
  total,
  onEdit,
  onBind,
  onShowQr,
  onView,
  onToggleBlocked,
  onUnbind,
  onSelectionChange,
  onDownloadSelectedQr,
  onBlockSelected,
  onUnblockSelected,
  onExportSelected,
  loading = false,
}: DevicesTableProps) {
  const search = route.useSearch()
  const navigate = route.useNavigate()
  const [rowSelection, setRowSelection] = useState({})
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})
  const sorting: SortingState = search.sort
    ? [{ id: search.sort, desc: search.dir !== 'asc' }]
    : [{ id: 'createdAt', desc: true }]

  const columns = useMemo(
    () =>
      getDevicesColumns({
        onEdit,
        onBind,
        onShowQr,
        onView,
        onToggleBlocked,
        onUnbind,
      }),
    [onBind, onEdit, onShowQr, onToggleBlocked, onUnbind, onView]
  )

  const {
    globalFilter,
    onGlobalFilterChange,
    columnFilters,
    onColumnFiltersChange,
    pagination,
    onPaginationChange,
    ensurePageInRange,
  } = useTableUrlState({
    search,
    navigate,
    pagination: { defaultPage: 1, defaultPageSize: 20 },
    globalFilter: { enabled: true, key: 'search' },
    columnFilters: [
      {
        columnId: 'status',
        searchKey: 'status',
        type: 'array',
        serialize: (value) => (value as string[])[0],
        deserialize: (value) => (value ? [value] : []),
      },
      {
        columnId: 'platform',
        searchKey: 'platform',
        type: 'array',
        serialize: (value) => (value as string[])[0],
        deserialize: (value) => (value ? [value] : []),
      },
      {
        columnId: 'binding',
        searchKey: 'binding',
        type: 'array',
        serialize: (value) => (value as string[])[0],
        deserialize: (value) => (value ? [value] : []),
      },
      {
        columnId: 'connection',
        searchKey: 'connection',
        type: 'array',
        serialize: (value) => (value as string[])[0],
        deserialize: (value) => (value ? [value] : []),
      },
    ],
  })

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      rowSelection,
      columnVisibility,
      globalFilter,
      columnFilters,
      pagination,
    },
    enableRowSelection: true,
    manualPagination: true,
    manualSorting: true,
    manualFiltering: true,
    pageCount: Math.max(1, Math.ceil(total / pagination.pageSize)),
    onRowSelectionChange: setRowSelection,
    onSortingChange: (updater) => {
      const next = typeof updater === 'function' ? updater(sorting) : updater
      const first = next[0]
      navigate({
        search: (prev) => ({
          ...prev,
          page: undefined,
          sort: deviceSorts.includes(first?.id as (typeof deviceSorts)[number])
            ? (first?.id as (typeof deviceSorts)[number])
            : undefined,
          dir: first ? (first.desc ? 'desc' : 'asc') : undefined,
        }),
      })
    },
    onColumnVisibilityChange: setColumnVisibility,
    onGlobalFilterChange,
    onColumnFiltersChange,
    onPaginationChange,
    getCoreRowModel: getCoreRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
  })

  useEffect(() => {
    onSelectionChange(
      table.getSelectedRowModel().rows.map((row) => row.original)
    )
  }, [onSelectionChange, rowSelection, table])

  useEffect(() => {
    ensurePageInRange(Math.max(1, Math.ceil(total / pagination.pageSize)))
  }, [ensurePageInRange, pagination.pageSize, total])

  return (
    <div className='flex flex-1 flex-col gap-3'>
      <DataTableToolbar
        table={table}
        searchPlaceholder='Search hardware ID, display name, or child...'
        filters={[
          {
            columnId: 'status',
            title: 'Provisioning',
            options: deviceStatusOptions,
          },
          {
            columnId: 'platform',
            title: 'Platform',
            options: devicePlatformOptions,
          },
          {
            columnId: 'binding',
            title: 'Binding',
            options: deviceBindingOptions,
          },
          {
            columnId: 'connection',
            title: 'Connection',
            options: deviceConnectionOptions,
          },
        ]}
      />
      <DataTableView
        table={table}
        loading={loading}
        emptyTitle='No devices found'
        emptyDescription='Try clearing filters, or add a device to get started.'
      />
      <DataTablePagination table={table} total={total} className='mt-auto' />
      <DeviceBulkActions
        table={table}
        onDownloadSelectedQr={onDownloadSelectedQr}
        onBlockSelected={onBlockSelected}
        onUnblockSelected={onUnblockSelected}
        onExportSelected={onExportSelected}
      />
    </div>
  )
}
