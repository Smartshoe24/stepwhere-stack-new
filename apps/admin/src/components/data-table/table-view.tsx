import type { ReactNode } from 'react'
import { flexRender, type Table as TanstackTable } from '@tanstack/react-table'
import { cn } from '@/lib/utils'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { EmptyState, TableSkeleton } from '@/components/patterns/states'

type DataTableViewProps<TData> = {
  table: TanstackTable<TData>
  loading?: boolean
  /** Shown when there are no rows and nothing is loading. */
  empty?: ReactNode
  emptyTitle?: string
  emptyDescription?: ReactNode
  onRowClick?: (row: TData) => void
  className?: string
}

/**
 * The shared table body for every TanStack table in the admin: header, rows
 * with selection state, loading skeleton and empty state. Toolbars,
 * pagination and bulk actions are composed around it by each feature.
 */
export function DataTableView<TData>({
  table,
  loading,
  empty,
  emptyTitle = 'Nothing to show',
  emptyDescription,
  onRowClick,
  className,
}: DataTableViewProps<TData>) {
  const rows = table.getRowModel().rows
  const columnCount = table.getVisibleLeafColumns().length

  return (
    <div
      className={cn(
        'overflow-hidden rounded-lg bg-canvas shadow-[inset_0_0_0_1px_var(--line-faint)]',
        className
      )}
    >
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id} className='hover:bg-transparent'>
              {headerGroup.headers.map((header) => (
                <TableHead key={header.id} colSpan={header.colSpan}>
                  {header.isPlaceholder
                    ? null
                    : flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      )}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {rows.length > 0 ? (
            rows.map((row) => (
              <TableRow
                key={row.id}
                data-state={row.getIsSelected() ? 'selected' : undefined}
                className={cn(onRowClick && 'cursor-pointer')}
                onClick={
                  onRowClick
                    ? (event) => {
                        const target = event.target as HTMLElement
                        if (
                          target.closest(
                            'button, a, input, [role="checkbox"], [role="menuitem"]'
                          )
                        )
                          return
                        onRowClick(row.original)
                      }
                    : undefined
                }
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow className='hover:bg-transparent'>
              <TableCell
                colSpan={columnCount}
                className='h-auto border-b-0 p-0'
              >
                {loading ? (
                  <TableSkeleton columns={Math.min(columnCount, 6)} />
                ) : (
                  (empty ?? (
                    <EmptyState
                      compact
                      title={emptyTitle}
                      description={emptyDescription}
                    />
                  ))
                )}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )
}
