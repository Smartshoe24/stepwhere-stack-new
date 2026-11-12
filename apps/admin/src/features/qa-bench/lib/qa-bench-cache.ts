import type { QueryClient } from '@tanstack/react-query'
import type {
  QaBenchJobDto,
  QaStationDto,
  QaStationSlotsDto,
  QaStationTestRunDto,
  QaTestRunDto,
  QaUnitDetailDto,
} from '@stepwhere/types'
import { adminQueryKeys } from '@/features/admin/query-keys'

/** Realtime job updates replace the row in place so progress never waits for a refetch. */
export function upsertQaJobInCache(
  queryClient: QueryClient,
  job: QaBenchJobDto
) {
  queryClient.setQueryData<QaBenchJobDto[]>(
    adminQueryKeys.qa.jobs(job.stationId),
    (jobs) => {
      if (!jobs) return jobs
      const index = jobs.findIndex((entry) => entry.id === job.id)
      if (index === -1) return [job, ...jobs]
      const next = jobs.slice()
      next[index] = job
      return next
    }
  )

  queryClient.setQueryData<QaStationDto[]>(
    adminQueryKeys.qa.stations(),
    (stations) =>
      stations?.map((station) => {
        if (station.id !== job.stationId) return station
        const active = job.status === 'queued' || job.status === 'running'
        const others = station.activeJobIds.filter((id) => id !== job.id)
        const activeJobIds = active ? [...others, job.id] : others
        return { ...station, activeJobIds, activeJobId: activeJobIds[0] ?? null }
      })
  )

  if (job.slotId) {
    const active = job.status === 'queued' || job.status === 'running'
    patchSlots(queryClient, job.stationId, (slot) =>
      slot.id !== job.slotId
        ? slot
        : active
          ? { ...slot, activeJob: job }
          : slot.activeJob?.id === job.id
            ? { ...slot, activeJob: null }
            : slot
    )
  }
}

function patchSlots(
  queryClient: QueryClient,
  stationId: string,
  patch: (
    slot: QaStationSlotsDto['slots'][number]
  ) => QaStationSlotsDto['slots'][number]
) {
  queryClient.setQueryData<QaStationSlotsDto>(
    adminQueryKeys.qa.stationSlots(stationId),
    (current) =>
      current ? { ...current, slots: current.slots.map(patch) } : current
  )
}

/** Board-test lines stream in every few seconds; patch the run where it is shown instead of refetching. */
export function upsertQaTestRunInCache(
  queryClient: QueryClient,
  run: QaTestRunDto
) {
  if (run.stationId) {
    queryClient.setQueryData<QaStationTestRunDto>(
      adminQueryKeys.qa.stationTestRun(run.stationId),
      (current) => {
        if (!current) return current
        const newer =
          !current.run ||
          current.run.id === run.id ||
          new Date(run.startedAt) >= new Date(current.run.startedAt)
        // A new run's unit may differ; the verdict refreshes when the unit changes.
        return newer ? { ...current, run } : current
      }
    )
  }

  if (run.stationId && run.slotId) {
    patchSlots(queryClient, run.stationId, (slot) => {
      if (slot.id !== run.slotId) return slot
      const newer =
        !slot.run ||
        slot.run.id === run.id ||
        new Date(run.startedAt) >= new Date(slot.run.startedAt)
      // A new board's unit and verdict arrive with the unit change that follows.
      return newer ? { ...slot, run } : slot
    })
  }

  if (run.unitId) {
    queryClient.setQueryData<QaUnitDetailDto>(
      adminQueryKeys.qa.unit(run.unitId),
      (unit) => {
        if (!unit) return unit
        const others = unit.testRuns.filter((entry) => entry.id !== run.id)
        const testRuns = [run, ...others].sort(
          (a, b) =>
            new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
        )
        return { ...unit, testRuns }
      }
    )
  }
}
