import { Check, Copy } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

/** A copyable single-line command or value in mono, inset like an input. */
export function CodeLine({
  value,
  label = 'Command',
  className,
}: {
  value: string
  label?: string
  className?: string
}) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    await navigator.clipboard.writeText(value)
    setCopied(true)
    toast.success(`${label} copied.`)
    window.setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div
      className={cn(
        'flex min-h-9 min-w-0 items-center gap-2 rounded-md bg-inset py-1.5 ps-3 pe-1 shadow-[inset_0_0_0_1px_var(--line)]',
        className
      )}
    >
      <code className='min-w-0 flex-1 font-mono text-xs break-all text-ink'>
        {value}
      </code>
      <Button
        type='button'
        variant='ghost'
        size='icon'
        className='size-7'
        aria-label={`Copy ${label.toLowerCase()}`}
        onClick={() => void copy()}
      >
        {copied ? <Check className='text-ok' /> : <Copy />}
      </Button>
    </div>
  )
}
