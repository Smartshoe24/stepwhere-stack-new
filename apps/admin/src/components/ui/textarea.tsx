import * as React from 'react'
import { cn } from '@/lib/utils'

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot='textarea'
      className={cn(
        'flex field-sizing-content min-h-16 w-full rounded-md bg-inset px-2.5 py-2 text-base text-ink shadow-[inset_0_0_0_1px_var(--line)] transition-[box-shadow] duration-150 outline-none placeholder:text-ink-3 hover:shadow-[inset_0_0_0_1px_var(--line-strong)] focus-visible:shadow-[0_0_0_var(--hair)_rgb(245_207_141/0.8),var(--focus-glow)] disabled:cursor-not-allowed disabled:bg-raised disabled:text-ink-4 aria-invalid:shadow-[inset_0_0_0_1px_rgb(248_113_113/0.55)] md:text-sm',
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
