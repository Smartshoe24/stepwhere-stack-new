import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { QaStationDto, QaStationPairingDto } from '@stepwhere/types'
import { CheckCircle2 } from 'lucide-react'
import { createQaStation, createQaStationPairingCode } from '@/lib/api-client'
import { handleServerError } from '@/lib/handle-server-error'
import { adminQueryKeys } from '@/features/admin/query-keys'
import { useLiveNow } from '@/hooks/use-live-now'
import { FormField } from '@/components/patterns/key-value'
import { LiveBadge } from '@/components/patterns/live'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { CodeLine } from './code-line'

type PairStationDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Set to issue a new code for an existing station instead of creating one. */
  repairStation?: QaStationDto | null
  stations: QaStationDto[]
  onPaired?: (stationId: string) => void
}

export function PairStationDialog({
  open,
  onOpenChange,
  repairStation,
  stations,
  onPaired,
}: PairStationDialogProps) {
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [pairing, setPairing] = useState<QaStationPairingDto | null>(null)

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setPairing(null)
      setName('')
    }
    onOpenChange(next)
  }

  const createMutation = useMutation({
    mutationFn: () =>
      repairStation
        ? createQaStationPairingCode(repairStation.id)
        : createQaStation({ name: name.trim() }),
    onSuccess: async (result) => {
      setPairing(result)
      await queryClient.invalidateQueries({
        queryKey: adminQueryKeys.qa.stations(),
      })
    },
    onError: handleServerError,
  })

  const issueCode = createMutation.mutate

  // Re-pairing needs no input, so issue the code as soon as the dialog opens.
  useEffect(() => {
    if (open && repairStation && !pairing && !createMutation.isPending) {
      issueCode()
    }
  }, [open, repairStation, pairing, createMutation.isPending, issueCode])

  const live = pairing
    ? stations.find((station) => station.id === pairing.station.id)
    : undefined
  // The pairing snapshot holds the old pairedAt; the agent's pair call moves it.
  const connected =
    !!pairing && !!live?.pairedAt && live.pairedAt !== pairing.station.pairedAt

  useEffect(() => {
    if (connected && pairing) onPaired?.(pairing.station.id)
  }, [connected, pairing, onPaired])

  const title = repairStation
    ? `Re-pair ${repairStation.name}`
    : 'Pair a bench station'

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className='sm:max-w-lg'>
        <DialogHeader className='text-start'>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {pairing
              ? 'Run these on the bench PC. The agent connects out to this server, so the PC can sit on any network.'
              : 'Each bench PC with an ST-LINK and a USB-TTL adapter runs the Stepwhere QA agent.'}
          </DialogDescription>
        </DialogHeader>

        {!pairing ? (
          repairStation ? (
            <p className='text-sm text-ink-3'>Issuing a new pairing code…</p>
          ) : (
            <FormField
              label='Station name'
              htmlFor='qa-station-name'
              help='Shown in the Bench picker, e.g. the desk or the operator.'
            >
              <Input
                id='qa-station-name'
                value={name}
                maxLength={60}
                autoFocus
                placeholder='Bench 1'
                onChange={(event) => setName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && name.trim()) issueCode()
                }}
              />
            </FormField>
          )
        ) : connected ? (
          <div className='flex flex-col items-center gap-2 py-6 text-center'>
            <CheckCircle2 className='size-8 text-ok' />
            <p className='text-base font-semibold text-ink'>
              {pairing.station.name} is paired
            </p>
            {live?.connection === 'online' ? (
              <LiveBadge>Agent online</LiveBadge>
            ) : (
              <p className='text-sm text-ink-3'>
                Start the agent to bring it online.
              </p>
            )}
          </div>
        ) : (
          <PairingSteps pairing={pairing} />
        )}

        <DialogFooter>
          {pairing ? (
            <Button onClick={() => handleOpenChange(false)}>
              {connected ? 'Done' : 'Close'}
            </Button>
          ) : repairStation ? null : (
            <>
              <Button variant='ghost' onClick={() => handleOpenChange(false)}>
                Cancel
              </Button>
              <Button
                disabled={!name.trim() || createMutation.isPending}
                onClick={() => issueCode()}
              >
                Create pairing code
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function PairingSteps({ pairing }: { pairing: QaStationPairingDto }) {
  const now = useLiveNow()
  const remainingMs = new Date(pairing.pairingExpiresAt).getTime() - now
  const expired = remainingMs <= 0
  const minutes = Math.max(0, Math.floor(remainingMs / 60_000))
  const seconds = Math.max(0, Math.floor((remainingMs % 60_000) / 1000))

  return (
    <div className='grid gap-4'>
      <div className='flex items-end justify-between gap-3 rounded-lg bg-canvas px-4 py-3 shadow-[inset_0_0_0_1px_var(--line)]'>
        <div>
          <div className='label-caps'>Pairing code</div>
          <div className='mt-1 font-mono text-2xl font-semibold tracking-[0.12em] text-ink tabular'>
            {pairing.pairingCode}
          </div>
        </div>
        <div
          className={
            expired ? 'text-xs text-breach' : 'text-xs text-ink-3 tabular'
          }
        >
          {expired
            ? 'Expired. Close and create a new code.'
            : `Expires in ${minutes}:${String(seconds).padStart(2, '0')}`}
        </div>
      </div>

      <ol className='grid gap-3 text-sm text-ink-2'>
        <li className='grid gap-1.5'>
          <span>
            <span className='font-mono text-2xs text-ink-4'>01 </span>
            {pairing.agentDownloadUrl
              ? 'Install Node.js 20+ and STM32CubeProgrammer on the bench PC, then the QA agent'
              : 'Install Node.js 20+, STM32CubeProgrammer and the QA agent on the bench PC. Setup steps are in apps/qa-agent/README.md.'}
          </span>
          {pairing.agentDownloadUrl ? (
            <CodeLine value={`npm install -g ${pairing.agentDownloadUrl}`} />
          ) : null}
        </li>
        <li className='grid gap-1.5'>
          <span>
            <span className='font-mono text-2xs text-ink-4'>02 </span>
            Pair it with this code
          </span>
          <CodeLine
            value={`stepwhere-qa-agent pair --server ${pairing.serverUrl} --code ${pairing.pairingCode}`}
          />
        </li>
        <li className='grid gap-1.5'>
          <span>
            <span className='font-mono text-2xs text-ink-4'>03 </span>
            Start it and leave it running
          </span>
          <CodeLine value='stepwhere-qa-agent start' />
        </li>
      </ol>

      <p className='flex items-center gap-2 text-xs text-ink-3'>
        <span className='size-3.5 animate-spin rounded-full border-2 border-current border-e-transparent' />
        Waiting for the agent to pair…
      </p>
    </div>
  )
}
