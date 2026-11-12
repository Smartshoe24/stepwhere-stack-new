import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  "focus-trail inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md text-sm font-medium whitespace-nowrap select-none transition-[background-color,color,box-shadow,transform] duration-150 ease-trail active:scale-[0.97] disabled:pointer-events-none disabled:opacity-100 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 aria-invalid:shadow-[inset_0_0_0_1px_var(--breach)]",
  {
    variants: {
      variant: {
        /* Peach wash, white label: the one primary action in a view. */
        default:
          'bg-act-fill font-semibold text-on-act-fill shadow-[inset_0_0_0_1px_var(--act-fill-line)] hover:bg-act-fill-hover active:bg-act-fill-press [&_svg]:text-act disabled:bg-act/5 disabled:text-ink-4 disabled:shadow-[inset_0_0_0_1px_rgb(244_200_125/0.1)] disabled:[&_svg]:text-ink-4',
        destructive:
          'bg-breach-wash text-breach shadow-[inset_0_0_0_1px_rgb(248_113_113/0.28)] hover:bg-breach/20 active:bg-breach/15 disabled:bg-transparent disabled:text-breach/40 disabled:shadow-[inset_0_0_0_1px_rgb(248_113_113/0.12)]',
        outline:
          'bg-overlay text-ink shadow-[inset_0_0_0_1px_var(--line)] hover:bg-hover hover:shadow-[inset_0_0_0_1px_var(--line-strong)] active:bg-raised disabled:bg-raised disabled:text-ink-4 disabled:shadow-[inset_0_0_0_1px_var(--line-faint)]',
        secondary:
          'bg-overlay text-ink shadow-[inset_0_0_0_1px_var(--line)] hover:bg-hover hover:shadow-[inset_0_0_0_1px_var(--line-strong)] active:bg-raised disabled:bg-raised disabled:text-ink-4 disabled:shadow-[inset_0_0_0_1px_var(--line-faint)]',
        ghost:
          'text-ink-2 hover:bg-white/5 hover:text-ink active:bg-white/[0.03] disabled:text-ink-4',
        link: 'h-auto! px-0! font-medium text-act underline-offset-[3px] hover:text-act-hover hover:underline active:scale-100',
      },
      size: {
        default: 'h-8 px-3 has-[>svg]:ps-2.5',
        sm: 'h-7 px-2.5 text-xs has-[>svg]:ps-2',
        lg: 'h-9 px-4 has-[>svg]:ps-3.5',
        icon: 'size-8',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
)

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot : 'button'

  return (
    <Comp
      data-slot='button'
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
