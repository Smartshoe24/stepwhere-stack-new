import * as React from 'react'
import { CheckIcon, PlusCircledIcon } from '@radix-ui/react-icons'
import { type Column } from '@tanstack/react-table'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Separator } from '@/components/ui/separator'

type DataTableFacetedFilterProps<TData, TValue> = {
  column?: Column<TData, TValue>
  title?: string
  options: {
    label: string
    value: string
    icon?: React.ComponentType<{ className?: string }>
  }[]
}

export function DataTableFacetedFilter<TData, TValue>({
  column,
  title,
  options,
}: DataTableFacetedFilterProps<TData, TValue>) {
  const filterValue = column?.getFilterValue()
  const selectedValues = new Set(
    Array.isArray(filterValue) ? (filterValue as string[]) : []
  )
  const facets = column?.accessorFn
    ? column.getFacetedUniqueValues()
    : undefined

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant='ghost'
          size='sm'
          className={cn(
            'shadow-[inset_0_0_0_1px_var(--line)]',
            selectedValues.size > 0
              ? 'bg-raised text-ink shadow-[inset_0_0_0_1px_var(--line-strong)]'
              : 'border-dashed'
          )}
        >
          <PlusCircledIcon className='size-3.5 text-ink-3' />
          {title}
          {selectedValues.size > 0 && (
            <>
              <Separator
                orientation='vertical'
                className='mx-1 h-3.5 bg-line'
              />
              <span className='font-medium text-act lg:hidden'>
                {selectedValues.size}
              </span>
              <span className='hidden font-medium text-act lg:inline'>
                {selectedValues.size > 2
                  ? `${selectedValues.size} selected`
                  : options
                      .filter((option) => selectedValues.has(option.value))
                      .map((option) => option.label)
                      .join(', ')}
              </span>
            </>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className='w-50 p-0' align='start'>
        <Command>
          <CommandInput placeholder={title} />
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>
            <CommandGroup>
              {options.map((option) => {
                const isSelected = selectedValues.has(option.value)
                return (
                  <CommandItem
                    key={option.value}
                    onSelect={() => {
                      if (isSelected) {
                        selectedValues.delete(option.value)
                      } else {
                        selectedValues.add(option.value)
                      }
                      const filterValues = Array.from(selectedValues)
                      column?.setFilterValue(
                        filterValues.length ? filterValues : undefined
                      )
                    }}
                  >
                    <div
                      className={cn(
                        'flex size-4 items-center justify-center rounded-xs',
                        isSelected
                          ? 'bg-toggle text-on-toggle'
                          : 'bg-inset shadow-[inset_0_0_0_1px_var(--line-strong)] [&_svg]:invisible'
                      )}
                    >
                      <CheckIcon className='size-3 text-on-toggle' />
                    </div>
                    {option.icon && (
                      <option.icon className='size-4 text-ink-3' />
                    )}
                    <span>{option.label}</span>
                    {facets?.get(option.value) && (
                      <span className='ms-auto flex h-4 min-w-4 items-center justify-center font-mono text-2xs text-ink-3'>
                        {facets.get(option.value)}
                      </span>
                    )}
                  </CommandItem>
                )
              })}
            </CommandGroup>
            {selectedValues.size > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem
                    onSelect={() => column?.setFilterValue(undefined)}
                    className='justify-center text-center'
                  >
                    Clear filters
                  </CommandItem>
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
