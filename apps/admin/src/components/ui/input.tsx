import * as React from 'react'
import { cn } from '@/lib/utils'

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot='input'
      className={cn(
        'flex h-8 w-full min-w-0 rounded-md bg-inset px-2.5 text-base text-ink shadow-[inset_0_0_0_1px_var(--line)] transition-[box-shadow] duration-150 outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-ink placeholder:text-ink-3 hover:shadow-[inset_0_0_0_1px_var(--line-strong)] disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-raised disabled:text-ink-4 disabled:shadow-[inset_0_0_0_1px_var(--line-faint)] disabled:placeholder:text-ink-4 md:text-sm',
        'focus-visible:shadow-[0_0_0_var(--hair)_rgb(245_207_141/0.8),var(--focus-glow)]',
        'aria-invalid:shadow-[inset_0_0_0_1px_rgb(248_113_113/0.55)]',
        className
      )}
      {...props}
    />
  )
}

export { Input }
