import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'focus-trail inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1.5 overflow-hidden rounded-full px-2 text-xs leading-none font-medium whitespace-nowrap transition-[color,box-shadow] [&>svg]:pointer-events-none [&>svg]:size-3',
  {
    variants: {
      variant: {
        default: 'bg-act-fill text-on-act-fill',
        secondary:
          'bg-white/5 text-ink-2 shadow-[inset_0_0_0_1px_var(--line-faint)]',
        destructive: 'bg-breach-wash text-breach',
        outline:
          'bg-white/5 text-ink-2 shadow-[inset_0_0_0_1px_var(--line-faint)] [a&]:hover:bg-white/8',
        ok: 'bg-ok-wash text-ok',
        caution: 'bg-caution-wash text-caution',
        breach: 'bg-breach-wash text-breach',
        info: 'bg-info-wash text-info',
        unset: 'bg-unset-wash text-unset',
        muted:
          'bg-white/5 text-ink-3 shadow-[inset_0_0_0_1px_var(--line-faint)]',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
)

type BadgeProps = React.ComponentProps<'span'> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }

function Badge({ className, variant, asChild = false, ...props }: BadgeProps) {
  const Comp = asChild ? Slot : 'span'

  return (
    <Comp
      data-slot='badge'
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants, type BadgeProps }
