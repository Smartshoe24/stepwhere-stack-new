import * as React from 'react'
import * as CheckboxPrimitive from '@radix-ui/react-checkbox'
import { CheckIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

function Checkbox({
  className,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot='checkbox'
      className={cn(
        'peer focus-hair relative size-4 shrink-0 rounded-xs bg-inset text-on-toggle shadow-[inset_0_0_0_1px_var(--line-strong)] transition-[background-color,box-shadow] duration-150 before:absolute before:-inset-3 before:content-[""] hover:shadow-[inset_0_0_0_1px_rgb(255_255_255/0.28)] disabled:cursor-not-allowed disabled:bg-raised disabled:shadow-[inset_0_0_0_1px_var(--line-faint)] aria-invalid:shadow-[inset_0_0_0_1px_var(--breach)] data-[state=checked]:bg-toggle data-[state=checked]:shadow-none data-[state=indeterminate]:bg-toggle data-[state=indeterminate]:shadow-none disabled:data-[state=checked]:bg-toggle-wash',
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot='checkbox-indicator'
        className='flex items-center justify-center text-current transition-none'
      >
        <CheckIcon className='size-3' strokeWidth={3} />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
