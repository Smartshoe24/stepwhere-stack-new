import { useEffect, useMemo, useState } from 'react'
import { getRouteApi } from '@tanstack/react-router'
import {
  type SortingState,
  type VisibilityState,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table'
import type { AdminFamilyListItemDto } from '@stepwhere/types'
import { useTableUrlState } from '@/hooks/use-table-url-state'
import {
  DataTablePagination,
  DataTableToolbar,
  DataTableView,
} from '@/components/data-table'
import { getFamiliesColumns } from './families-columns'

const route = getRouteApi('/_authenticated/families/')
const familySorts = ['createdAt', 'familyName'] as const

export function FamiliesTable({
  data,
  total,
  onView,
  loading = false,
}: {
  data: AdminFamilyListItemDto[]
  total: number
  onView: (family: AdminFamilyListItemDto) => void
  loading?: boolean
}) {
  const search = route.useSearch()
  const navigate = route.useNavigate()
  const [rowSelection, setRowSelection] = useState({})
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})
  const sorting: SortingState = search.sort
    ? [{ id: search.sort, desc: search.dir !== 'asc' }]
    : [{ id: 'createdAt', desc: true }]

  const columns = useMemo(() => getFamiliesColumns({ onView }), [onView])

  const {
    globalFilter,
    onGlobalFilterChange,
    pagination,
    onPaginationChange,
    ensurePageInRange,
  } = useTableUrlState({
    search,
    navigate,
    pagination: { defaultPage: 1, defaultPageSize: 20 },
    globalFilter: { enabled: true, key: 'search' },
    columnFilters: [],
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
          sort: familySorts.includes(first?.id as (typeof familySorts)[number])
            ? (first?.id as (typeof familySorts)[number])
            : undefined,
          dir: first ? (first.desc ? 'desc' : 'asc') : undefined,
        }),
      })
    },
    onColumnVisibilityChange: setColumnVisibility,
    onGlobalFilterChange,
    onPaginationChange,
    getCoreRowModel: getCoreRowModel(),
  })

  useEffect(() => {
    ensurePageInRange(Math.max(1, Math.ceil(total / pagination.pageSize)))
  }, [ensurePageInRange, pagination.pageSize, total])

  return (
    <div className='flex flex-1 flex-col gap-3'>
      <DataTableToolbar
        table={table}
        searchPlaceholder='Search families by name or slug...'
      />
      <DataTableView
        table={table}
        loading={loading}
        emptyTitle='No families found'
        emptyDescription='Try clearing filters or searching by a different name.'
      />
      <DataTablePagination table={table} total={total} className='mt-auto' />
    </div>
  )
}
