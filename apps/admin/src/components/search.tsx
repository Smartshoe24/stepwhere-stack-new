import { SearchIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSearch } from '@/context/search-provider'

export function Search({
  className = '',
  placeholder = 'Search or jump to…',
  ...props
}: React.ComponentProps<'button'> & { placeholder?: string }) {
  const { setOpen } = useSearch()
  return (
    <button
      type='button'
      {...props}
      className={cn(
        'focus-trail group flex h-8 items-center gap-2 rounded-md bg-inset ps-2.5 pe-1.5 text-sm text-ink-3 shadow-[inset_0_0_0_1px_var(--line)] transition-[box-shadow,color] duration-150 hover:text-ink-2 hover:shadow-[inset_0_0_0_1px_var(--line-strong)]',
        className
      )}
      aria-keyshortcuts='Meta+K Control+K'
      onClick={() => setOpen(true)}
    >
      <SearchIcon aria-hidden='true' className='size-4 shrink-0' />
      <span className='hidden flex-1 truncate text-start sm:inline'>
        {placeholder}
      </span>
      <span className='sr-only sm:hidden'>{placeholder}</span>
      <kbd className='pointer-events-none hidden h-5 items-center rounded-xs bg-raised px-1.5 font-mono text-2xs text-ink-3 shadow-[inset_0_0_0_1px_var(--line)] select-none sm:inline-flex'>
        ⌘K
      </kbd>
    </button>
  )
}
