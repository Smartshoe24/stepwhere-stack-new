import { useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  QA_DEFAULT_BAUD_RATE,
  QA_MAX_SLOTS,
  type QaStationDto,
  type QaStationSlotsDto,
} from '@stepwhere/types'
import { Ear, ListOrdered } from 'lucide-react'
import { toast } from 'sonner'
import { openQaSerial, updateQaStationSlots } from '@/lib/api-client'
import { handleServerError } from '@/lib/handle-server-error'
import { cn } from '@/lib/utils'
import { adminQueryKeys } from '@/features/admin/query-keys'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useQaBenchEvents } from '../../lib/qa-bench-events'
import { useNow } from '../../lib/use-now'

const ANY_PROBE = '__any__'
/** A port that printed within this window is shown as talking, to tell adapters apart. */
const TALKING_MS = 4000

type Row = {
  key: string
  path: string | null
  detail: string
  stable: boolean
  likelyUsbTtl: boolean
  use: boolean
  position: string
  label: string
  probe: string
}

function initialRows(data: QaStationSlotsDto, probes: string[]): Row[] {
  const configured: Row[] = data.slots.map((slot) => {
    const port = data.ports.find((entry) => entry.key === slot.portKey)
    return {
      key: slot.portKey,
      path: slot.portPath,
      detail: port?.serialNumber
        ? `${port.manufacturer ?? 'USB'} · ${port.serialNumber}`
        : slot.portStable
          ? 'Unplugged'
          : 'No USB serial number',
      stable: slot.portStable,
      likelyUsbTtl: port?.likelyUsbTtl ?? true,
      use: true,
      position: String(slot.position),
      label: slot.label === `Slot ${slot.position}` ? '' : slot.label,
      probe: slot.probeSerial ?? ANY_PROBE,
    }
  })
  const unused: Row[] = data.ports
    .filter((port) => !port.slotId)
    .sort((a, b) => Number(b.likelyUsbTtl) - Number(a.likelyUsbTtl) || a.path.localeCompare(b.path))
    .map((port) => ({
      key: port.key,
      path: port.path,
      detail: port.serialNumber
        ? `${port.manufacturer ?? 'USB'} · ${port.serialNumber}`
        : `${port.manufacturer ?? 'Serial port'} · no USB serial number`,
      stable: !!port.serialNumber,
      likelyUsbTtl: port.likelyUsbTtl,
      use: false,
      position: '',
      label: '',
      // With one ST-LINK on the bench, every slot shares it.
      probe: probes.length === 1 ? probes[0] : ANY_PROBE,
    }))
  return [...configured, ...unused]
}

/**
 * Which TTL adapter is which slot, and which ST-LINK flashes it. Done once per
 * bench; a slot follows its adapter by USB serial number when it has one.
 */
export function SlotSetupDialog({
  station,
  data,
  open,
  onOpenChange,
}: {
  station: QaStationDto
  data: QaStationSlotsDto
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-4xl'>
        {open ? (
          <SetupForm station={station} data={data} onDone={() => onOpenChange(false)} />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function SetupForm({
  station,
  data,
  onDone,
}: {
  station: QaStationDto
  data: QaStationSlotsDto
  onDone: () => void
}) {
  const queryClient = useQueryClient()
  const now = useNow(1000)
  const probes = useMemo(
    () => station.hardware?.probes.map((probe) => probe.serial) ?? [],
    [station.hardware?.probes]
  )
  const [rows, setRows] = useState(() => initialRows(data, probes))
  const live = new Map(data.ports.map((port) => [port.key, port]))
  // Output arrives over realtime; the slots query only knows when it was fetched.
  const [heardAt, setHeardAt] = useState<Record<string, number>>({})
  useQaBenchEvents((event) => {
    if (event.type === 'admin:qa.serial.data' && event.data.stationId === station.id) {
      setHeardAt((current) => ({ ...current, [event.data.path]: Date.now() }))
    }
  })

  const update = (key: string, patch: Partial<Row>) =>
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)))

  const used = rows.filter((row) => row.use)
  const positions = used.map((row) => Number(row.position))
  const duplicate = positions.find((value, index) => positions.indexOf(value) !== index)
  const invalid = used.find((row) => {
    const value = Number(row.position)
    return !Number.isInteger(value) || value < 1 || value > QA_MAX_SLOTS
  })
  const error = invalid
    ? `Give every slot a number from 1 to ${QA_MAX_SLOTS}.`
    : duplicate
      ? `Slot ${duplicate} is used twice.`
      : null

  const numberInOrder = () => {
    let next = 1
    setRows((current) =>
      current.map((row) => (row.use ? { ...row, position: String(next++) } : row))
    )
  }

  const listenMutation = useMutation({
    mutationFn: () =>
      Promise.all(
        data.ports
          .filter((port) => port.likelyUsbTtl && !port.open)
          .map((port) =>
            openQaSerial(station.id, { path: port.path, baudRate: QA_DEFAULT_BAUD_RATE })
          )
      ),
    onSuccess: (opened) =>
      toast.success(
        opened.length
          ? `Listening on ${opened.length} adapter${opened.length === 1 ? '' : 's'}. Reset a board to see which one talks.`
          : 'Every USB-TTL adapter is already open.'
      ),
    onError: handleServerError,
  })

  const saveMutation = useMutation({
    mutationFn: () =>
      updateQaStationSlots(station.id, {
        slots: used.map((row) => ({
          position: Number(row.position),
          label: row.label.trim() || null,
          portKey: row.key,
          probeSerial: row.probe === ANY_PROBE ? null : row.probe,
        })),
      }),
    onSuccess: (saved) => {
      queryClient.setQueryData(adminQueryKeys.qa.stationSlots(station.id), saved)
      toast.success(`${saved.slots.length} slot${saved.slots.length === 1 ? '' : 's'} saved.`)
      onDone()
    },
    onError: handleServerError,
  })

  return (
    <>
      <DialogHeader className='text-start'>
        <DialogTitle>Set up slots</DialogTitle>
        <DialogDescription>
          Each slot is one USB-TTL adapter and the ST-LINK that flashes the
          board in it. To tell adapters apart, press Listen, then reset or plug
          in a board: its adapter shows <b className='text-ink-2'>Talking now</b>.
        </DialogDescription>
      </DialogHeader>

      <div className='flex flex-wrap items-center gap-2'>
        <Button
          variant='outline'
          size='sm'
          disabled={station.connection !== 'online' || listenMutation.isPending}
          onClick={() => listenMutation.mutate()}
        >
          <Ear />
          Listen on all adapters
        </Button>
        <Button
          variant='outline'
          size='sm'
          onClick={() =>
            setRows((current) =>
              current.map((row) => (row.likelyUsbTtl && row.path ? { ...row, use: true } : row))
            )
          }
        >
          Use every USB-TTL adapter
        </Button>
        <Button variant='outline' size='sm' disabled={used.length === 0} onClick={numberInOrder}>
          <ListOrdered />
          Number 1 to {used.length || 'n'}
        </Button>
        <span className='ms-auto text-xs text-ink-3'>
          {used.length} slot{used.length === 1 ? '' : 's'} · {probes.length} ST-LINK
          {probes.length === 1 ? '' : 's'} plugged in
        </span>
      </div>

      <div className='max-h-[52vh] overflow-y-auto rounded-md shadow-[inset_0_0_0_1px_var(--line-faint)]'>
        <table className='w-full text-sm'>
          <thead className='sticky top-0 bg-raised text-xs text-ink-3'>
            <tr className='[&>th]:px-3 [&>th]:py-2 [&>th]:text-start [&>th]:font-medium'>
              <th className='w-8' />
              <th className='w-20'>Slot</th>
              <th>Name</th>
              <th>TTL adapter</th>
              <th className='w-48'>ST-LINK</th>
            </tr>
          </thead>
          <tbody className='divide-y divide-line-faint'>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className='px-3 py-6 text-center text-ink-3'>
                  The agent sees no serial ports. Plug the USB-TTL adapters in
                  and press Rescan.
                </td>
              </tr>
            ) : null}
            {rows.map((row) => {
              const port = live.get(row.key)
              const lastLine = Math.max(
                port?.lastLineAt ? new Date(port.lastLineAt).getTime() : 0,
                row.path ? (heardAt[row.path] ?? 0) : 0
              )
              const talking = now - lastLine < TALKING_MS
              return (
                <tr
                  key={row.key}
                  className={cn('[&>td]:px-3 [&>td]:py-2', !row.use && 'text-ink-3')}
                >
                  <td>
                    <Checkbox
                      checked={row.use}
                      aria-label={`Use ${row.path ?? row.key}`}
                      onCheckedChange={(checked) => update(row.key, { use: checked === true })}
                    />
                  </td>
                  <td>
                    <Input
                      inputMode='numeric'
                      className='h-7 w-16 tabular'
                      value={row.position}
                      disabled={!row.use}
                      aria-label='Slot number'
                      onChange={(event) =>
                        update(row.key, { position: event.target.value.replace(/\D/g, '') })
                      }
                    />
                  </td>
                  <td>
                    <Input
                      className='h-7'
                      maxLength={40}
                      placeholder={row.position ? `Slot ${row.position}` : 'Slot name'}
                      value={row.label}
                      disabled={!row.use}
                      onChange={(event) => update(row.key, { label: event.target.value })}
                    />
                  </td>
                  <td className='min-w-0'>
                    <div className='flex items-center gap-2'>
                      <span className='truncate font-mono text-xs text-ink-2'>
                        {row.path ?? 'unplugged'}
                      </span>
                      {talking ? (
                        <span className='shrink-0 rounded-full bg-ok-wash px-1.5 py-px text-[10px] font-semibold text-ok'>
                          Talking now
                        </span>
                      ) : port?.open ? (
                        <span className='shrink-0 text-[10px] text-ink-4'>listening</span>
                      ) : null}
                    </div>
                    <p className={cn('truncate text-[11px]', row.stable ? 'text-ink-4' : 'text-caution')}>
                      {row.detail}
                      {row.stable ? '' : ' · slot follows the port path'}
                    </p>
                  </td>
                  <td>
                    <Select
                      value={row.probe}
                      disabled={!row.use}
                      onValueChange={(value) => update(row.key, { probe: value })}
                    >
                      <SelectTrigger className='h-7 w-full font-mono text-xs'>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={ANY_PROBE}>Any ST-LINK</SelectItem>
                        {[...new Set([...probes, ...(row.probe !== ANY_PROBE ? [row.probe] : [])])].map(
                          (serial) => (
                            <SelectItem key={serial} value={serial}>
                              <span className='font-mono text-xs'>{serial}</span>
                              {probes.includes(serial) ? null : (
                                <span className='text-ink-3'>not plugged in</span>
                              )}
                            </SelectItem>
                          )
                        )}
                      </SelectContent>
                    </Select>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <DialogFooter className='items-center'>
        {error ? <p className='me-auto text-xs text-breach'>{error}</p> : (
          <p className='me-auto text-xs text-ink-3'>
            Slots that share an ST-LINK are flashed one at a time from their card.
          </p>
        )}
        <Button variant='ghost' onClick={onDone}>
          Cancel
        </Button>
        <Button disabled={!!error || saveMutation.isPending} onClick={() => saveMutation.mutate()}>
          Save slots
        </Button>
      </DialogFooter>
    </>
  )
}
