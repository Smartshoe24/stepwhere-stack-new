import type { QaStationDto } from '@stepwhere/types'
import { Cable, Cpu, MoreHorizontal, RefreshCcw, Usb } from 'lucide-react'
import { cn } from '@/lib/utils'
import { AdminLastSeen } from '@/features/admin/components/admin-last-seen'
import { StatusBadge } from '@/features/admin/components/status-badge'
import { LiveBadge } from '@/components/patterns/live'
import { Panel } from '@/components/patterns/panel'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { describePort } from '../lib/qa-bench-format'

export function StationConnectionBadge({ station }: { station: QaStationDto }) {
  if (station.connection === 'online')
    return <LiveBadge>Agent online</LiveBadge>
  if (station.connection === 'never_paired')
    return <StatusBadge tone='muted'>Not paired</StatusBadge>
  return <StatusBadge tone='muted'>Offline</StatusBadge>
}

export function StationPanel({
  station,
  scanning,
  onScan,
  onRename,
  onRepair,
  onRemove,
}: {
  station: QaStationDto
  scanning: boolean
  onScan: () => void
  onRename: () => void
  onRepair: () => void
  onRemove: () => void
}) {
  const agent = station.agent
  const programmer = agent?.programmer
  const online = station.connection === 'online'

  return (
    <Panel
      title={station.name}
      actions={
        <>
          <Button
            variant='ghost'
            size='sm'
            disabled={!online || scanning}
            onClick={onScan}
            title='Ask the agent to rescan probes and serial ports'
          >
            <RefreshCcw className={cn(scanning && 'animate-spin')} />
            Rescan
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant='ghost'
                size='icon'
                className='size-7'
                aria-label='Station actions'
              >
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end'>
              <DropdownMenuItem onSelect={onRename}>Rename</DropdownMenuItem>
              <DropdownMenuItem onSelect={onRepair}>
                Re-pair agent
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant='destructive' onSelect={onRemove}>
                Remove station
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      }
    >
      <dl className='grid grid-cols-[96px_minmax(0,1fr)] gap-x-3 gap-y-2.5 text-sm'>
        <dt className='text-ink-3'>Status</dt>
        <dd>
          <StationConnectionBadge station={station} />
        </dd>
        <dt className='text-ink-3'>Last seen</dt>
        <dd className='text-ink'>
          {online ? 'Now' : <AdminLastSeen value={station.lastSeenAt} />}
        </dd>
        <dt className='text-ink-3'>Computer</dt>
        <dd className='truncate text-ink'>
          {agent ? `${agent.hostname} · ${agent.platform}/${agent.arch}` : '—'}
        </dd>
        <dt className='text-ink-3'>Agent</dt>
        <dd className='text-ink tabular'>
          {agent
            ? `v${agent.agentVersion} · Node ${agent.nodeVersion.replace(/^v/, '')}`
            : '—'}
        </dd>
        <dt className='text-ink-3'>Programmer</dt>
        <dd className='min-w-0'>
          {!programmer ? (
            <span className='text-ink-3'>—</span>
          ) : programmer.found ? (
            <span className='text-ink'>
              STM32CubeProgrammer {programmer.version ?? ''}
            </span>
          ) : (
            <span className='text-breach'>
              Not found{programmer.error ? ` · ${programmer.error}` : ''}
            </span>
          )}
        </dd>
      </dl>
    </Panel>
  )
}

export function HardwarePanel({ station }: { station: QaStationDto }) {
  const hardware = station.hardware
  const openPaths = new Set(
    station.serialSessions.map((session) => session.path)
  )
  const ttlPorts = hardware?.ports.filter((port) => port.likelyUsbTtl) ?? []
  const otherPorts = hardware?.ports.filter((port) => !port.likelyUsbTtl) ?? []

  return (
    <Panel
      title='Connected hardware'
      description={
        hardware
          ? `Scanned ${new Date(hardware.scannedAt).toLocaleTimeString()}`
          : undefined
      }
    >
      {!hardware ? (
        <p className='text-sm text-ink-3'>
          {station.connection === 'online'
            ? 'Waiting for the agent’s first scan…'
            : 'Hardware shows up while the agent is online.'}
        </p>
      ) : (
        <div className='grid min-w-0 gap-4'>
          <section className='grid min-w-0 gap-2'>
            <h3 className='label-caps'>ST-LINK probes</h3>
            {hardware.probes.length === 0 ? (
              <p className='text-sm text-ink-3'>
                {hardware.probeScanError ??
                  'No ST-LINK detected. Check the USB cable.'}
              </p>
            ) : (
              hardware.probes.map((probe) => (
                <HardwareRow
                  key={probe.serial}
                  icon={<Cpu />}
                  title={
                    probe.boardName && probe.boardName !== '--'
                      ? probe.boardName
                      : 'ST-LINK'
                  }
                  subtitle={`SN ${probe.serial}${probe.firmware ? ` · FW ${probe.firmware}` : ''}`}
                  mono
                />
              ))
            )}
          </section>
          <section className='grid min-w-0 gap-2'>
            <h3 className='label-caps'>Serial ports</h3>
            {hardware.ports.length === 0 ? (
              <p className='text-sm text-ink-3'>No serial ports found.</p>
            ) : (
              [...ttlPorts, ...otherPorts].map((port) => (
                <HardwareRow
                  key={port.path}
                  icon={port.likelyUsbTtl ? <Usb /> : <Cable />}
                  title={port.path}
                  subtitle={describePort(port) || 'Unknown adapter'}
                  mono
                  muted={!port.likelyUsbTtl}
                  trailing={
                    openPaths.has(port.path) ? (
                      <StatusBadge tone='info'>Open</StatusBadge>
                    ) : port.likelyUsbTtl ? (
                      <StatusBadge tone='default'>USB-TTL</StatusBadge>
                    ) : null
                  }
                />
              ))
            )}
          </section>
        </div>
      )}
    </Panel>
  )
}

function HardwareRow({
  icon,
  title,
  subtitle,
  trailing,
  mono,
  muted,
}: {
  icon: React.ReactNode
  title: string
  subtitle: string
  trailing?: React.ReactNode
  mono?: boolean
  muted?: boolean
}) {
  return (
    <div
      className={cn(
        'flex min-w-0 items-center gap-3 rounded-md bg-canvas px-3 py-2 shadow-[inset_0_0_0_1px_var(--line-faint)]',
        muted && 'opacity-70'
      )}
    >
      <span className='grid size-7 shrink-0 place-items-center rounded-md bg-overlay text-ink-2 shadow-[inset_0_0_0_1px_var(--line)] [&_svg]:size-3.5'>
        {icon}
      </span>
      <div className='min-w-0 flex-1'>
        <div
          className={cn(
            'truncate text-sm text-ink',
            mono && 'font-mono text-xs'
          )}
        >
          {title}
        </div>
        <div className='truncate text-xs text-ink-3'>{subtitle}</div>
      </div>
      {trailing}
    </div>
  )
}
