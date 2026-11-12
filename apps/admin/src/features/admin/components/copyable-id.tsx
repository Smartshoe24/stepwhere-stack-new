import { Copy } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'

export function CopyableId({
  value,
  copyLabel,
  className,
}: {
  value: string
  copyLabel: string
  className?: string
}) {
  const onCopy = async () => {
    await navigator.clipboard.writeText(value)
    toast.success(`${copyLabel} copied.`)
  }

  return (
    <div className={className}>
      <div className='inline-flex max-w-full items-center gap-1 rounded-xs bg-white/[0.03] ps-1.5 font-mono text-2xs text-ink-3 shadow-[inset_0_0_0_1px_var(--line-faint)]'>
        <span className='truncate tabular'>{value}</span>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type='button'
              variant='ghost'
              size='icon'
              className='size-5 shrink-0 rounded-xs text-ink-3'
              onClick={() => void onCopy()}
              aria-label={`Copy ${copyLabel}`}
            >
              <Copy className='size-3' />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{`Copy ${copyLabel}`}</TooltipContent>
        </Tooltip>
      </div>
    </div>
  )
}
