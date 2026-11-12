import { useEffect, useMemo, useState } from 'react'
import { getRouteApi } from '@tanstack/react-router'
import {
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  type SortingState,
  type VisibilityState,
  useReactTable,
} from '@tanstack/react-table'
import type { QaUnitListItemDto } from '@stepwhere/types'
import { useTableUrlState } from '@/hooks/use-table-url-state'
import {
  DataTablePagination,
  DataTableToolbar,
  DataTableView,
} from '@/components/data-table'
import { stageOptions, stageStatusOptions } from '../lib/qa-unit-format'
import { getUnitsColumns } from './units-columns'

const route = getRouteApi('/_authenticated/qa/units/')
const unitSorts = ['updatedAt', 'createdAt', 'stage', 'imei'] as const

const singleValueFilter = (columnId: string, searchKey: string) => ({
  columnId,
  searchKey,
  type: 'array' as const,
  serialize: (value: unknown) => (value as string[])[0],
  deserialize: (value: unknown) => (value ? [value as string] : []),
})

export function UnitsTable({
  data,
  total,
  loading = false,
}: {
  data: QaUnitListItemDto[]
  total: number
  loading?: boolean
}) {
  const search = route.useSearch()
  const navigate = route.useNavigate()
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})
  const sorting: SortingState = search.sort
    ? [{ id: search.sort, desc: search.dir !== 'asc' }]
    : [{ id: 'updatedAt', desc: true }]
  const columns = useMemo(() => getUnitsColumns(), [])

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
      singleValueFilter('stage', 'stage'),
      singleValueFilter('status', 'status'),
    ],
  })

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      columnVisibility,
      globalFilter,
      columnFilters,
      pagination,
    },
    manualPagination: true,
    manualSorting: true,
    manualFiltering: true,
    pageCount: Math.max(1, Math.ceil(total / pagination.pageSize)),
    onSortingChange: (updater) => {
      const next = typeof updater === 'function' ? updater(sorting) : updater
      const first = next[0]
      navigate({
        search: (prev) => ({
          ...prev,
          page: undefined,
          sort: unitSorts.includes(first?.id as (typeof unitSorts)[number])
            ? (first?.id as (typeof unitSorts)[number])
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
        searchPlaceholder='Search IMEI or chip UID...'
        filters={[
          { columnId: 'stage', title: 'Stage', options: stageOptions },
          { columnId: 'status', title: 'Status', options: stageStatusOptions },
        ]}
      />
      <DataTableView
        table={table}
        loading={loading}
        emptyTitle='No units found'
        emptyDescription='Units appear here the first time the Bench identifies or flashes a board.'
      />
      <DataTablePagination table={table} total={total} className='mt-auto' />
    </div>
  )
}
