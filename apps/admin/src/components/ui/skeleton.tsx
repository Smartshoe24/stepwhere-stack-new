import { cn } from '@/lib/utils'

function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot='skeleton'
      className={cn(
        'animate-[trail-shimmer_1.6s_linear_infinite] rounded-xs bg-[linear-gradient(90deg,rgb(255_255_255/0.04)_0%,rgb(255_255_255/0.09)_40%,rgb(255_255_255/0.04)_80%)] bg-[length:240%_100%]',
        className
      )}
      {...props}
    />
  )
}

export { Skeleton }
