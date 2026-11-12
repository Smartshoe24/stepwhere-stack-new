import { cn } from '@/lib/utils'

type MainProps = React.HTMLAttributes<HTMLElement> & {
  fixed?: boolean
  fluid?: boolean
  ref?: React.Ref<HTMLElement>
}

/** Page body. 20px gutters, content capped at 1440px unless `fluid`. */
export function Main({ fixed, className, fluid, ...props }: MainProps) {
  return (
    <main
      id='content'
      data-layout={fixed ? 'fixed' : 'auto'}
      className={cn(
        'flex flex-1 flex-col gap-5 px-4 py-5 sm:px-5',
        fixed && 'grow overflow-hidden',
        !fluid && 'mx-auto w-full max-w-[1440px]',
        className
      )}
      {...props}
    />
  )
}
