import {
  ChevronLeftIcon,
  ChevronRightIcon,
  DoubleArrowLeftIcon,
  DoubleArrowRightIcon,
} from '@radix-ui/react-icons'
import { type Table } from '@tanstack/react-table'
import { cn, getPageNumbers } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

type DataTablePaginationProps<TData> = {
  table: Table<TData>
  total: number
  className?: string
}

type PageBasedPaginationProps = {
  page: number
  pageSize: number
  total: number
  onPageChange: (page: number) => void
  onPageSizeChange: (pageSize: number) => void
  className?: string
}

const pageSizeOptions = [10, 20, 30, 40, 50]

export function PageBasedPagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  className,
}: PageBasedPaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const currentPage = Math.min(Math.max(page, 1), totalPages)
  const pageNumbers = getPageNumbers(currentPage, totalPages)
  const firstResult = total === 0 ? 0 : (currentPage - 1) * pageSize + 1
  const lastResult = Math.min(currentPage * pageSize, total)
  const canGoBack = currentPage > 1
  const canGoForward = currentPage < totalPages

  return (
    <nav
      aria-label='Table pagination'
      className={cn(
        'flex items-center justify-between overflow-clip px-1',
        '@max-2xl/content:flex-col-reverse @max-2xl/content:gap-4',
        className
      )}
      style={{ overflowClipMargin: 8 }}
    >
      <div className='flex w-full items-center justify-between gap-3'>
        <div className='text-xs tabular-nums text-ink-3' aria-live='polite'>
          {total === 0
            ? '0 results'
            : `${firstResult}–${lastResult} of ${total}`}
        </div>
        <div className='flex items-center gap-2 @max-2xl/content:flex-row-reverse'>
          <Select
            value={`${pageSize}`}
            onValueChange={(value) => {
              onPageSizeChange(Number(value))
            }}
          >
            <SelectTrigger
              size='sm'
              className='w-16'
              aria-label='Rows per page'
            >
              <SelectValue placeholder={pageSize} />
            </SelectTrigger>
            <SelectContent side='top'>
              {pageSizeOptions.map((option) => (
                <SelectItem key={option} value={`${option}`}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className='hidden text-xs text-ink-3 sm:block'>Rows per page</p>
        </div>
      </div>

      <div className='flex max-w-full items-center overflow-x-auto pb-px sm:space-x-6 lg:space-x-8'>
        <div className='flex w-25 items-center justify-center text-xs text-ink-3 tabular-nums @max-3xl/content:hidden'>
          Page {currentPage} of {totalPages}
        </div>
        <div className='flex items-center gap-0.5'>
          <Button
            variant='ghost'
            size='icon'
            className='size-7 @max-md/content:hidden'
            onClick={() => onPageChange(1)}
            disabled={!canGoBack}
          >
            <span className='sr-only'>Go to first page</span>
            <DoubleArrowLeftIcon className='h-4 w-4' />
          </Button>
          <Button
            variant='ghost'
            size='icon'
            className='size-7'
            onClick={() => onPageChange(currentPage - 1)}
            disabled={!canGoBack}
          >
            <span className='sr-only'>Go to previous page</span>
            <ChevronLeftIcon className='h-4 w-4' />
          </Button>

          {/* Page number buttons */}
          {pageNumbers.map((pageNumber, index) => (
            <div key={`${pageNumber}-${index}`} className='flex items-center'>
              {pageNumber === '...' ? (
                <span className='px-1 text-xs text-ink-3' aria-hidden='true'>
                  ...
                </span>
              ) : (
                <Button
                  variant={currentPage === pageNumber ? 'outline' : 'ghost'}
                  size='sm'
                  className={cn(
                    'min-w-7 px-1.5 tabular-nums',
                    currentPage !== pageNumber && 'text-ink-3'
                  )}
                  aria-current={currentPage === pageNumber ? 'page' : undefined}
                  onClick={() => onPageChange(pageNumber as number)}
                >
                  <span className='sr-only'>Go to page {pageNumber}</span>
                  {pageNumber}
                </Button>
              )}
            </div>
          ))}

          <Button
            variant='ghost'
            size='icon'
            className='size-7'
            onClick={() => onPageChange(currentPage + 1)}
            disabled={!canGoForward}
          >
            <span className='sr-only'>Go to next page</span>
            <ChevronRightIcon className='h-4 w-4' />
          </Button>
          <Button
            variant='ghost'
            size='icon'
            className='size-7 @max-md/content:hidden'
            onClick={() => onPageChange(totalPages)}
            disabled={!canGoForward}
          >
            <span className='sr-only'>Go to last page</span>
            <DoubleArrowRightIcon className='h-4 w-4' />
          </Button>
        </div>
      </div>
    </nav>
  )
}

export function DataTablePagination<TData>({
  table,
  total,
  className,
}: DataTablePaginationProps<TData>) {
  const { pageIndex, pageSize } = table.getState().pagination

  return (
    <PageBasedPagination
      page={pageIndex + 1}
      pageSize={pageSize}
      total={total}
      onPageChange={(page) => table.setPageIndex(page - 1)}
      onPageSizeChange={(nextPageSize) =>
        table.setPagination({ pageIndex: 0, pageSize: nextPageSize })
      }
      className={className}
    />
  )
}
