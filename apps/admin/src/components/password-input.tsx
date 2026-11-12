import * as React from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from './ui/button'

type PasswordInputProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'type'
> & {
  ref?: React.Ref<HTMLInputElement>
}

export function PasswordInput({
  className,
  disabled,
  ref,
  ...props
}: PasswordInputProps) {
  const [showPassword, setShowPassword] = React.useState(false)

  return (
    <div className={cn('relative rounded-md', className)}>
      <input
        type={showPassword ? 'text' : 'password'}
        className='flex h-8 w-full rounded-md bg-inset ps-2.5 pe-9 text-sm text-ink shadow-[inset_0_0_0_1px_var(--line)] transition-[box-shadow] duration-150 outline-none placeholder:text-ink-3 hover:shadow-[inset_0_0_0_1px_var(--line-strong)] focus-visible:shadow-[0_0_0_var(--hair)_rgb(245_207_141/0.8),var(--focus-glow)] disabled:cursor-not-allowed disabled:bg-raised disabled:text-ink-4 aria-invalid:shadow-[inset_0_0_0_1px_rgb(248_113_113/0.55)]'
        ref={ref}
        disabled={disabled}
        {...props}
      />
      <Button
        type='button'
        size='icon'
        variant='ghost'
        disabled={disabled}
        className='absolute inset-e-1 top-1/2 size-6 -translate-y-1/2 text-ink-3'
        onClick={() => setShowPassword((prev) => !prev)}
      >
        {showPassword ? (
          <Eye className='size-3.5' />
        ) : (
          <EyeOff className='size-3.5' />
        )}
        <span className='sr-only'>
          {showPassword ? 'Hide password' : 'Show password'}
        </span>
      </Button>
    </div>
  )
}
