import { useLayoutEffect, useRef, useState } from 'react'
import { ArrowDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

export type ConsoleLine = {
  id: number
  text: string
  /** ISO time; shown when timestamps are on. */
  at?: string
  tone?: 'ok' | 'error' | 'dim' | 'sent'
}

const toneClass: Record<NonNullable<ConsoleLine['tone']>, string> = {
  ok: 'text-ok',
  error: 'text-breach',
  dim: 'text-ink-3',
  sent: 'text-act',
}

function formatTime(at: string) {
  const date = new Date(at)
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleTimeString([], { hour12: false }) +
        '.' +
        String(date.getMilliseconds()).padStart(3, '0')
}

/**
 * A monospace log well. It follows new lines while the reader is at the bottom
 * and stops following as soon as they scroll up, so they can read history.
 */
export function LogConsole({
  lines,
  height = 280,
  showTimestamps,
  emptyLabel,
  className,
}: {
  lines: ConsoleLine[]
  height?: number
  showTimestamps?: boolean
  emptyLabel?: string
  className?: string
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  // Line count when the reader scrolled away; a cleared or replaced log follows again.
  const [pausedAt, setPausedAt] = useState<number | null>(null)
  const following = pausedAt === null || lines.length < pausedAt

  useLayoutEffect(() => {
    const node = scrollRef.current
    if (node && following) node.scrollTop = node.scrollHeight
  }, [lines, following])

  return (
    <div className={cn('relative', className)}>
      <div
        ref={scrollRef}
        role='log'
        aria-live='off'
        onScroll={(event) => {
          const node = event.currentTarget
          const atBottom =
            node.scrollHeight - node.scrollTop - node.clientHeight < 24
          setPausedAt(atBottom ? null : (current) => current ?? lines.length)
        }}
        style={{ height }}
        className='overflow-y-auto rounded-lg bg-inset px-3.5 py-3 font-mono text-xs leading-[1.7] text-ink-2 shadow-[inset_0_0_0_1px_var(--line-faint)]'
      >
        {lines.length === 0 ? (
          <p className='text-ink-3'>{emptyLabel ?? 'Nothing yet.'}</p>
        ) : (
          lines.map((line) => (
            <div
              key={line.id}
              className={cn(
                'break-words whitespace-pre-wrap',
                line.tone && toneClass[line.tone]
              )}
            >
              {showTimestamps && line.at ? (
                <span className='me-3 text-ink-4 select-none'>
                  {formatTime(line.at)}
                </span>
              ) : null}
              {line.text || ' '}
            </div>
          ))
        )}
      </div>
      {!following && lines.length > 0 ? (
        <Button
          variant='outline'
          size='sm'
          className='absolute end-3 bottom-3'
          onClick={() => setPausedAt(null)}
        >
          <ArrowDown />
          Latest
        </Button>
      ) : null}
    </div>
  )
}
