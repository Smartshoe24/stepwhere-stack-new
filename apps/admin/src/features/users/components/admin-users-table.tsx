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
import type { AdminUserListItemDto } from '@stepwhere/types'
import { useTableUrlState } from '@/hooks/use-table-url-state'
import {
  DataTablePagination,
  DataTableToolbar,
  DataTableView,
} from '@/components/data-table'
import {
  onboardingOptions,
  userBanStateOptions,
  userRoleOptions,
  userStatusOptions,
} from '../data/admin-user-options'
import { AdminUsersBulkActions } from './admin-users-bulk-actions'
import { getAdminUsersColumns } from './admin-users-columns'

const route = getRouteApi('/_authenticated/users/')
const userSorts = [
  'createdAt',
  'displayName',
  'phoneNumber',
  'lastSeenAt',
  'role',
  'status',
] as const

type AdminUsersTableProps = {
  data: AdminUserListItemDto[]
  total: number
  onEdit: (user: AdminUserListItemDto) => void
  onBan: (user: AdminUserListItemDto) => void
  onView: (user: AdminUserListItemDto) => void
  loading?: boolean
}

export function AdminUsersTable({
  data,
  total,
  onEdit,
  onBan,
  onView,
  loading = false,
}: AdminUsersTableProps) {
  const search = route.useSearch()
  const navigate = route.useNavigate()
  const [rowSelection, setRowSelection] = useState({})
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})
  const sorting: SortingState = search.sort
    ? [{ id: search.sort, desc: search.dir !== 'asc' }]
    : [{ id: 'createdAt', desc: true }]

  const columns = useMemo(
    () => getAdminUsersColumns({ onEdit, onBan, onView }),
    [onBan, onEdit, onView]
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
        columnId: 'role',
        searchKey: 'role',
        type: 'array',
        serialize: (value) => (value as string[])[0],
        deserialize: (value) => (value ? [value] : []),
      },
      {
        columnId: 'status',
        searchKey: 'status',
        type: 'array',
        serialize: (value) => (value as string[])[0],
        deserialize: (value) => (value ? [value] : []),
      },
      {
        columnId: 'banState',
        searchKey: 'banned',
        type: 'array',
        serialize: (value) => {
          const next = (value as string[])[0]
          return next === 'banned'
            ? 'true'
            : next === 'not_banned'
              ? 'false'
              : undefined
        },
        deserialize: (value) =>
          value === 'true'
            ? ['banned']
            : value === 'false'
              ? ['not_banned']
              : [],
      },
      {
        columnId: 'onboarding',
        searchKey: 'onboarding',
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
          sort: userSorts.includes(first?.id as (typeof userSorts)[number])
            ? (first?.id as (typeof userSorts)[number])
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
        searchPlaceholder='Search users by name, phone, email, or family...'
        filters={[
          {
            columnId: 'role',
            title: 'Role',
            options: userRoleOptions,
          },
          {
            columnId: 'status',
            title: 'Status',
            options: userStatusOptions,
          },
          {
            columnId: 'banState',
            title: 'Ban state',
            options: userBanStateOptions,
          },
          {
            columnId: 'onboarding',
            title: 'Onboarding',
            options: onboardingOptions,
          },
        ]}
      />
      <DataTableView
        table={table}
        loading={loading}
        emptyTitle='No users found'
        emptyDescription='Try clearing filters or searching by a different email.'
      />
      <DataTablePagination table={table} total={total} className='mt-auto' />
      <AdminUsersBulkActions table={table} />
    </div>
  )
}
