import * as React from 'react'
import * as SwitchPrimitive from '@radix-ui/react-switch'
import { cn } from '@/lib/utils'

function Switch({
  className,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot='switch'
      className={cn(
        'peer focus-trail inline-flex h-[18px] w-8 shrink-0 items-center rounded-full px-0.5 transition-[background-color,box-shadow] duration-150 disabled:cursor-not-allowed data-[state=checked]:bg-toggle data-[state=unchecked]:bg-hover data-[state=unchecked]:shadow-[inset_0_0_0_1px_var(--line-strong)] disabled:data-[state=checked]:bg-toggle-wash disabled:data-[state=unchecked]:bg-raised',
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot='switch-thumb'
        className={cn(
          'pointer-events-none block size-3.5 rounded-full transition-[transform,background-color] duration-150 ease-trail data-[state=checked]:translate-x-3.5 data-[state=checked]:bg-on-toggle data-[state=unchecked]:translate-x-0 data-[state=unchecked]:bg-ink-2'
        )}
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
