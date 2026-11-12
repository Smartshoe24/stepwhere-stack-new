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
import type { AdminChildListItemDto } from '@stepwhere/types'
import { useTableUrlState } from '@/hooks/use-table-url-state'
import {
  DataTablePagination,
  DataTableToolbar,
  DataTableView,
} from '@/components/data-table'
import {
  childBindingOptions,
  childLifecycleOptions,
  childTelemetryOptions,
  childTrackingOptions,
} from '../data/children-options'
import { getChildrenColumns } from './children-columns'

const route = getRouteApi('/_authenticated/children/')
const childSorts = [
  'createdAt',
  'name',
  'lastSeenAt',
  'lifecycleStatus',
] as const

export function ChildrenTable({
  data,
  total,
  onView,
  onBind,
  onUnbind,
  loading = false,
}: {
  data: AdminChildListItemDto[]
  total: number
  onView: (child: AdminChildListItemDto) => void
  onBind: (child: AdminChildListItemDto) => void
  onUnbind: (child: AdminChildListItemDto) => void
  loading?: boolean
}) {
  const search = route.useSearch()
  const navigate = route.useNavigate()
  const [rowSelection, setRowSelection] = useState({})
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})
  const sorting: SortingState = search.sort
    ? [{ id: search.sort, desc: search.dir !== 'asc' }]
    : [{ id: 'createdAt', desc: true }]

  const columns = useMemo(
    () => getChildrenColumns({ onView, onBind, onUnbind }),
    [onBind, onUnbind, onView]
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
        columnId: 'lifecycleStatus',
        searchKey: 'lifecycleStatus',
        type: 'array',
        serialize: (value) => (value as string[])[0],
        deserialize: (value) => (value ? [value] : []),
      },
      {
        columnId: 'trackingStatus',
        searchKey: 'trackingStatus',
        type: 'array',
        serialize: (value) => (value as string[])[0],
        deserialize: (value) => (value ? [value] : []),
      },
      {
        columnId: 'telemetryState',
        searchKey: 'telemetryState',
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
          sort: childSorts.includes(first?.id as (typeof childSorts)[number])
            ? (first?.id as (typeof childSorts)[number])
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
    ensurePageInRange(Math.max(1, Math.ceil(total / pagination.pageSize)))
  }, [ensurePageInRange, pagination.pageSize, total])

  return (
    <div className='flex flex-1 flex-col gap-3'>
      <DataTableToolbar
        table={table}
        searchPlaceholder='Search child name or school...'
        filters={[
          {
            columnId: 'lifecycleStatus',
            title: 'Lifecycle',
            options: childLifecycleOptions,
          },
          {
            columnId: 'trackingStatus',
            title: 'Tracking',
            options: childTrackingOptions,
          },
          {
            columnId: 'telemetryState',
            title: 'Telemetry',
            options: childTelemetryOptions,
          },
          {
            columnId: 'binding',
            title: 'Binding',
            options: childBindingOptions,
          },
        ]}
      />
      <DataTableView
        table={table}
        loading={loading}
        emptyTitle='No children found'
        emptyDescription='Try clearing filters or searching by a different name.'
      />
      <DataTablePagination table={table} total={total} className='mt-auto' />
    </div>
  )
}
