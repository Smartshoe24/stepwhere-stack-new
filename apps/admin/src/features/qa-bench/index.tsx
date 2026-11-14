import { useState } from 'react'
import { getRouteApi } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { QaStationDto } from '@stepwhere/types'
import { LayoutGrid, Plus, Settings2, SquareTerminal } from 'lucide-react'
import { toast } from 'sonner'
import {
  getQaStationSlots,
  listQaBenchJobs,
  listQaFirmwareUploads,
  listQaStations,
  renameQaStation,
  setQaStationAutomation,
  requestQaHardwareScan,
  revokeQaStation,
} from '@/lib/api-client'
import { handleServerError } from '@/lib/handle-server-error'
import { adminQueryKeys } from '@/features/admin/query-keys'
import { Main } from '@/components/layout/main'
import { FormField } from '@/components/patterns/key-value'
import { PageHeader } from '@/components/patterns/page-header'
import { Switch } from '@/components/ui/switch'
import { Panel } from '@/components/patterns/panel'
import { EmptyState, TableSkeleton } from '@/components/patterns/states'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
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
import { BoardTestsPanel } from './components/board-tests-panel'
import { FlashPanel } from './components/flash-panel'
import { PairStationDialog } from './components/pair-station-dialog'
import { RecentJobsPanel } from './components/recent-jobs-panel'
import { SerialConsolePanel } from './components/serial-console'
import { SlotBench } from './components/slots/slot-bench'
import { SlotSetupDialog } from './components/slots/slot-setup-dialog'
import { StationUnitPanel } from './components/station-unit-panel'
import {
  HardwarePanel,
  StationConnectionBadge,
  StationPanel,
} from './components/station-panels'

const route = getRouteApi('/_authenticated/qa/bench')

export function QaBench() {
  const search = route.useSearch()
  const navigate = route.useNavigate()
  const queryClient = useQueryClient()
  const [pairOpen, setPairOpen] = useState(false)
  const [repairStation, setRepairStation] = useState<QaStationDto | null>(null)
  const [renaming, setRenaming] = useState<QaStationDto | null>(null)
  const [removing, setRemoving] = useState<QaStationDto | null>(null)
  const [settingUpSlots, setSettingUpSlots] = useState(false)
  // A pick only applies to the station it was made on.
  const [picked, setPicked] = useState<{
    stationId: string
    jobId: string
  } | null>(null)

  const stationsQuery = useQuery({
    queryKey: adminQueryKeys.qa.stations(),
    queryFn: listQaStations,
    // Realtime events keep this current; the poll only covers a dropped socket.
    refetchInterval: 30_000,
  })
  const stations = stationsQuery.data ?? []
  const station =
    stations.find((entry) => entry.id === search.station) ?? stations[0] ?? null

  const jobsQuery = useQuery({
    queryKey: adminQueryKeys.qa.jobs(station?.id ?? ''),
    queryFn: () => listQaBenchJobs(station?.id ?? ''),
    enabled: !!station,
  })
  const slotsQuery = useQuery({
    queryKey: adminQueryKeys.qa.stationSlots(station?.id ?? ''),
    queryFn: () => getQaStationSlots(station?.id ?? ''),
    enabled: !!station,
    // Realtime keeps runs and jobs current; this catches adapters coming and going.
    refetchInterval: 15_000,
  })
  const slots = slotsQuery.data?.stationId === station?.id ? slotsQuery.data : undefined
  const hasSlots = (slots?.slots.length ?? 0) > 0
  const showSlots = hasSlots && search.view !== 'single'

  const firmwareQuery = useQuery({
    queryKey: adminQueryKeys.qa.firmwareUploads(),
    queryFn: () => listQaFirmwareUploads(),
  })

  const jobs = jobsQuery.data ?? []
  // A running job always takes over the view; otherwise show the picked or latest job.
  const activeJob = jobs.find((job) => job.id === station?.activeJobId) ?? null
  const pickedJob =
    picked && picked.stationId === station?.id
      ? jobs.find((job) => job.id === picked.jobId)
      : undefined
  const shownJob = activeJob ?? pickedJob ?? jobs[0] ?? null

  const scanMutation = useMutation({
    mutationFn: (stationId: string) => requestQaHardwareScan(stationId),
    onSuccess: () => toast.success('Rescan requested.'),
    onError: handleServerError,
  })

  const removeMutation = useMutation({
    mutationFn: (stationId: string) => revokeQaStation(stationId),
    onSuccess: async () => {
      setRemoving(null)
      await queryClient.invalidateQueries({
        queryKey: adminQueryKeys.qa.stations(),
      })
      void navigate({ search: {} })
      toast.success('Station removed. Its agent can no longer connect.')
    },
    onError: handleServerError,
  })

  const automationMutation = useMutation({
    mutationFn: (input: { stationId: string; enabled: boolean }) =>
      setQaStationAutomation(input.stationId, { enabled: input.enabled }),
    onSuccess: async (updated) => {
      await queryClient.invalidateQueries({ queryKey: adminQueryKeys.qa.stations() })
      toast.success(
        updated.automationEnabled
          ? 'Automatic mode on: boards are flashed, tested and handed over without clicks.'
          : 'Automatic mode off.'
      )
    },
    onError: handleServerError,
  })

  const selectStation = (stationId: string) =>
    void navigate({ search: { station: stationId } })
  const setView = (view: 'slots' | 'single') =>
    void navigate({ search: (prev) => ({ ...prev, view }) })

  return (
    <>
      <Main>
        <PageHeader
          title='Bench'
          description='Flash boards and read their TTL output through the QA agent on a bench PC.'
          meta={station ? <StationConnectionBadge station={station} /> : null}
          actions={
            <>
              {station && hasSlots ? (
                <label
                  className='inline-flex items-center gap-2 text-sm text-ink-2'
                  title='Every board clipped into a slot with its own ST-LINK is flashed with the newest QA firmware, tested, retried once on a network failure, and given the newest production firmware (.hex) when it passes.'
                >
                  <Switch
                    checked={station.automationEnabled}
                    disabled={automationMutation.isPending}
                    onCheckedChange={(enabled) =>
                      automationMutation.mutate({ stationId: station.id, enabled })
                    }
                    aria-label='Automatic mode'
                  />
                  Automatic
                </label>
              ) : null}
              {station && hasSlots ? (
                <div
                  role='group'
                  aria-label='Bench view'
                  className='inline-flex rounded-md bg-canvas p-0.5 shadow-[inset_0_0_0_1px_var(--line)]'
                >
                  <Button
                    size='sm'
                    variant={showSlots ? 'secondary' : 'ghost'}
                    aria-pressed={showSlots}
                    onClick={() => setView('slots')}
                  >
                    <LayoutGrid />
                    Slots · {slots?.slots.length}
                  </Button>
                  <Button
                    size='sm'
                    variant={showSlots ? 'ghost' : 'secondary'}
                    aria-pressed={!showSlots}
                    onClick={() => setView('single')}
                  >
                    <SquareTerminal />
                    Single board
                  </Button>
                </div>
              ) : null}
              {station && slots ? (
                <Button variant='outline' onClick={() => setSettingUpSlots(true)}>
                  <Settings2 />
                  {hasSlots ? 'Slots' : 'Set up slots'}
                </Button>
              ) : null}
              {stations.length > 0 ? (
                <Select value={station?.id} onValueChange={selectStation}>
                  <SelectTrigger className='w-48' aria-label='Bench station'>
                    <SelectValue placeholder='Choose a station' />
                  </SelectTrigger>
                  <SelectContent>
                    {stations.map((entry) => (
                      <SelectItem key={entry.id} value={entry.id}>
                        <span
                          aria-hidden='true'
                          className={
                            entry.connection === 'online'
                              ? 'size-1.5 rounded-full bg-trail'
                              : 'size-1.5 rounded-full bg-ink-4'
                          }
                        />
                        {entry.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : null}
              <Button
                variant='outline'
                onClick={() => {
                  setRepairStation(null)
                  setPairOpen(true)
                }}
              >
                <Plus />
                Pair station
              </Button>
            </>
          }
        />

        {stationsQuery.isLoading ? (
          <Panel flush>
            <TableSkeleton rows={4} columns={3} />
          </Panel>
        ) : !station ? (
          <Panel>
            <EmptyState
              title='No bench stations yet'
              description='Pair the PC that has the ST-LINK and the USB-TTL adapter. It runs a small agent that flashes boards and streams their serial output here.'
              action={
                <Button onClick={() => setPairOpen(true)}>
                  <Plus />
                  Pair a station
                </Button>
              }
            />
          </Panel>
        ) : showSlots && slots ? (
          <div className='grid gap-4'>
            <SlotBench
              station={station}
              data={slots}
              firmwareUploads={firmwareQuery.data ?? []}
            />
            <div className='grid items-start gap-4 lg:grid-cols-2 xl:grid-cols-3'>
              <StationPanel
                station={station}
                scanning={scanMutation.isPending}
                onScan={() => scanMutation.mutate(station.id)}
                onRename={() => setRenaming(station)}
                onRepair={() => {
                  setRepairStation(station)
                  setPairOpen(true)
                }}
                onRemove={() => setRemoving(station)}
              />
              <HardwarePanel station={station} />
              <RecentJobsPanel
                jobs={jobs}
                selectedJobId={null}
                onSelect={() => setView('single')}
              />
            </div>
          </div>
        ) : (
          <div className='grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_340px]'>
            <div className='grid min-w-0 gap-4'>
              <FlashPanel
                station={station}
                firmwareUploads={firmwareQuery.data ?? []}
                shownJob={shownJob}
              />
              <BoardTestsPanel station={station} />
              <SerialConsolePanel key={station.id} station={station} />
            </div>
            <div className='grid min-w-0 gap-4'>
              <StationUnitPanel station={station} />
              <StationPanel
                station={station}
                scanning={scanMutation.isPending}
                onScan={() => scanMutation.mutate(station.id)}
                onRename={() => setRenaming(station)}
                onRepair={() => {
                  setRepairStation(station)
                  setPairOpen(true)
                }}
                onRemove={() => setRemoving(station)}
              />
              <HardwarePanel station={station} />
              <RecentJobsPanel
                jobs={jobs}
                selectedJobId={shownJob?.id ?? null}
                onSelect={(jobId) =>
                  setPicked({ stationId: station.id, jobId })
                }
              />
            </div>
          </div>
        )}
      </Main>

      {station && slots ? (
        <SlotSetupDialog
          station={station}
          data={slots}
          open={settingUpSlots}
          onOpenChange={setSettingUpSlots}
        />
      ) : null}
      <PairStationDialog
        open={pairOpen}
        onOpenChange={setPairOpen}
        repairStation={repairStation}
        stations={stations}
        onPaired={selectStation}
      />
      {renaming ? (
        <RenameStationDialog
          key={renaming.id}
          station={renaming}
          onClose={() => setRenaming(null)}
        />
      ) : null}
      <AlertDialog
        open={!!removing}
        onOpenChange={(open) => !open && setRemoving(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {removing?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              The agent on that PC is disconnected and its token stops working.
              Job history is kept. You can pair the PC again later as a new
              station.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className='bg-breach-wash text-breach hover:bg-breach/20'
              disabled={removeMutation.isPending}
              onClick={(event) => {
                event.preventDefault()
                if (removing) removeMutation.mutate(removing.id)
              }}
            >
              Remove station
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function RenameStationDialog({
  station,
  onClose,
}: {
  station: QaStationDto
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const [name, setName] = useState(station.name)

  const mutation = useMutation({
    mutationFn: () => renameQaStation(station.id, { name: name.trim() }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: adminQueryKeys.qa.stations(),
      })
      onClose()
    },
    onError: handleServerError,
  })

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className='sm:max-w-sm'>
        <DialogHeader className='text-start'>
          <DialogTitle>Rename station</DialogTitle>
        </DialogHeader>
        <FormField label='Station name' htmlFor='qa-station-rename'>
          <Input
            id='qa-station-rename'
            value={name}
            maxLength={60}
            onChange={(event) => setName(event.target.value)}
          />
        </FormField>
        <DialogFooter>
          <Button variant='ghost' onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!name.trim() || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
