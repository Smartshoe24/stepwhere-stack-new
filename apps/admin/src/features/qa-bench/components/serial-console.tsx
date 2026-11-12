import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import {
  QA_DEFAULT_BAUD_RATE,
  type QaSerialLine,
  type QaStationDto,
} from '@stepwhere/types'
import { Download, Eraser, Plug, PlugZap, SendHorizontal } from 'lucide-react'
import { toast } from 'sonner'
import {
  closeQaSerial,
  getQaSerialBuffer,
  openQaSerial,
  writeQaSerial,
} from '@/lib/api-client'
import { handleServerError } from '@/lib/handle-server-error'
import { StatusBadge } from '@/features/admin/components/status-badge'
import { LiveBadge } from '@/components/patterns/live'
import { Panel } from '@/components/patterns/panel'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { useQaBenchEvents } from '../lib/qa-bench-events'
import { QA_BAUD_RATES } from '../lib/qa-bench-format'
import { LogConsole, type ConsoleLine } from './log-console'

const MAX_LINES = 5000
const LINE_ENDINGS = {
  crlf: { label: 'CR LF', value: '\r\n' },
  lf: { label: 'LF', value: '\n' },
  cr: { label: 'CR', value: '\r' },
  none: { label: 'No ending', value: '' },
} as const
type LineEnding = keyof typeof LINE_ENDINGS

/**
 * The board's debug UART (USART1, PB6/PB7) as seen through the bench's USB-TTL
 * adapter. The agent keeps the port open, so output keeps arriving while the
 * board is flashed and reboots.
 */
export function SerialConsolePanel({
  station,
  fixedPath,
  height = 380,
}: {
  station: QaStationDto
  /** Show one slot's port and hide the port picker. */
  fixedPath?: string | null
  height?: number
}) {
  const ports = useMemo(() => {
    const list = station.hardware?.ports ?? []
    return [...list].sort(
      (a, b) => Number(b.likelyUsbTtl) - Number(a.likelyUsbTtl)
    )
  }, [station.hardware?.ports])
  const sessions = station.serialSessions
  const online = station.connection === 'online'

  const [pickedPath, setPath] = useState<string | null>(null)
  const [pickedBaudRate, setBaudRate] = useState<number>(QA_DEFAULT_BAUD_RATE)
  const [showTimestamps, setShowTimestamps] = useState(true)
  const [lines, setLines] = useState<ConsoleLine[]>([])
  const [input, setInput] = useState('')
  const [lineEnding, setLineEnding] = useState<LineEnding>('crlf')
  const history = useRef<string[]>([])
  const historyIndex = useRef(-1)
  const counter = useRef(0)

  // Follow an already-open port, else the first likely USB-TTL adapter.
  const path =
    fixedPath !== undefined
      ? fixedPath
      : pickedPath && ports.some((port) => port.path === pickedPath)
        ? pickedPath
        : (sessions[0]?.path ?? ports[0]?.path ?? null)
  const session = sessions.find((entry) => entry.path === path) ?? null
  const baudRate = session?.baudRate ?? pickedBaudRate

  // Recent output the server kept for this port, so a reload doesn't start blank.
  useEffect(() => {
    if (!path || !online) return
    let cancelled = false
    getQaSerialBuffer(station.id, path)
      .then((buffer) => {
        if (!cancelled) setLines(toConsoleLines(buffer.lines, counter))
      })
      .catch(() => {
        if (!cancelled) setLines([])
      })
    return () => {
      cancelled = true
    }
  }, [station.id, path, online])

  useQaBenchEvents((event) => {
    if (event.data.stationId !== station.id) return
    if (event.type === 'admin:qa.serial.data' && event.data.path === path) {
      const incoming = toConsoleLines(event.data.lines, counter)
      setLines((current) => [...current, ...incoming].slice(-MAX_LINES))
    }
    if (event.type === 'admin:qa.serial.error' && event.data.path === path) {
      toast.error(`${event.data.path}: ${event.data.message}`)
    }
  })

  const openMutation = useMutation({
    mutationFn: () => openQaSerial(station.id, { path: path ?? '', baudRate }),
    onError: handleServerError,
  })
  const closeMutation = useMutation({
    mutationFn: () => closeQaSerial(station.id, { path: path ?? '' }),
    onError: handleServerError,
  })
  const writeMutation = useMutation({
    mutationFn: (data: string) =>
      writeQaSerial(station.id, { path: path ?? '', data }),
    onError: handleServerError,
  })

  const send = () => {
    const text = input
    if (!session || (!text && lineEnding === 'none')) return
    writeMutation.mutate(text + LINE_ENDINGS[lineEnding].value)
    setLines((current) =>
      [
        ...current,
        {
          id: ++counter.current,
          text: `› ${text}`,
          at: new Date().toISOString(),
          tone: 'sent' as const,
        },
      ].slice(-MAX_LINES)
    )
    if (text)
      history.current = [
        text,
        ...history.current.filter((entry) => entry !== text),
      ].slice(0, 30)
    historyIndex.current = -1
    setInput('')
  }

  const download = () => {
    const text = lines
      .map((line) => (line.at ? `${line.at}  ${line.text}` : line.text))
      .join('\n')
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${station.name.replace(/\W+/g, '-')}-${(path ?? 'serial').split('/').pop()}-${new Date().toISOString().replace(/[:.]/g, '-')}.log`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Panel
      title='Serial console'
      description={
        fixedPath !== undefined ? (
          <span className='font-mono text-xs'>{path ?? 'Adapter unplugged'}</span>
        ) : (
          'Debug UART over the bench USB-TTL adapter (board PB6 → adapter RX, PB7 ← adapter TX).'
        )
      }
      actions={
        session ? (
          <LiveBadge>Open · {session.baudRate}</LiveBadge>
        ) : (
          <StatusBadge tone='muted'>Closed</StatusBadge>
        )
      }
    >
      <div className='grid gap-3'>
        <div className='flex flex-wrap items-center gap-2'>
          {fixedPath !== undefined ? null : (
          <Select
            value={path ?? undefined}
            onValueChange={setPath}
            disabled={ports.length === 0}
          >
            <SelectTrigger className='w-64 max-w-full font-mono text-xs'>
              <SelectValue
                placeholder={online ? 'No serial ports' : 'Agent offline'}
              />
            </SelectTrigger>
            <SelectContent>
              {ports.map((port) => (
                <SelectItem key={port.path} value={port.path}>
                  <span className='font-mono text-xs'>{port.path}</span>
                  {port.likelyUsbTtl ? (
                    <span className='text-ink-3'>USB-TTL</span>
                  ) : null}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          )}
          <Select
            value={String(baudRate)}
            onValueChange={(value) => setBaudRate(Number(value))}
            disabled={!!session}
          >
            <SelectTrigger className='w-28 tabular'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {QA_BAUD_RATES.map((rate) => (
                <SelectItem key={rate} value={String(rate)}>
                  {rate}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {session ? (
            <Button
              variant='outline'
              disabled={closeMutation.isPending}
              onClick={() => closeMutation.mutate()}
            >
              <Plug />
              Close
            </Button>
          ) : (
            <Button
              variant='outline'
              disabled={!online || !path || openMutation.isPending}
              onClick={() => openMutation.mutate()}
            >
              <PlugZap />
              Open port
            </Button>
          )}
          <div className='ms-auto flex items-center gap-1'>
            <div className='flex items-center gap-2 pe-2'>
              <Switch
                id='serial-timestamps'
                checked={showTimestamps}
                onCheckedChange={setShowTimestamps}
              />
              <Label htmlFor='serial-timestamps' className='text-xs text-ink-2'>
                Timestamps
              </Label>
            </div>
            <Button
              variant='ghost'
              size='icon'
              aria-label='Clear console'
              title='Clear'
              onClick={() => setLines([])}
            >
              <Eraser />
            </Button>
            <Button
              variant='ghost'
              size='icon'
              aria-label='Download log'
              title='Download log'
              disabled={lines.length === 0}
              onClick={download}
            >
              <Download />
            </Button>
          </div>
        </div>

        <LogConsole
          lines={lines}
          height={height}
          showTimestamps={showTimestamps}
          emptyLabel={
            session
              ? 'Port open. Waiting for the board to print…'
              : 'Open the port to read the board’s TTL output.'
          }
        />

        <form
          className='flex gap-2'
          onSubmit={(event) => {
            event.preventDefault()
            send()
          }}
        >
          <Input
            value={input}
            disabled={!session}
            placeholder={
              session
                ? 'Send to the board, e.g. CELLPROBE'
                : 'Open the port to send'
            }
            className='font-mono text-xs'
            maxLength={500}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowUp' && history.current.length) {
                event.preventDefault()
                historyIndex.current = Math.min(
                  history.current.length - 1,
                  historyIndex.current + 1
                )
                setInput(history.current[historyIndex.current])
              }
              if (event.key === 'ArrowDown' && historyIndex.current >= 0) {
                event.preventDefault()
                historyIndex.current -= 1
                setInput(
                  historyIndex.current >= 0
                    ? history.current[historyIndex.current]
                    : ''
                )
              }
            }}
          />
          <Select
            value={lineEnding}
            onValueChange={(value) => setLineEnding(value as LineEnding)}
          >
            <SelectTrigger className='w-28' disabled={!session}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(LINE_ENDINGS).map(([key, ending]) => (
                <SelectItem key={key} value={key}>
                  {ending.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type='submit'
            variant='outline'
            disabled={!session || writeMutation.isPending}
          >
            <SendHorizontal />
            Send
          </Button>
        </form>
      </div>
    </Panel>
  )
}

function toConsoleLines(
  lines: QaSerialLine[],
  counter: { current: number }
): ConsoleLine[] {
  return lines.map((line) => ({
    id: ++counter.current,
    text: line.text,
    at: line.at,
    tone: /\b(error|fail(ed)?)\b/i.test(line.text) ? 'error' : undefined,
  }))
}
