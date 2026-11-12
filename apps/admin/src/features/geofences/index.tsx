import { useEffect, useMemo, useState } from 'react'
import { getRouteApi } from '@tanstack/react-router'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Check } from 'lucide-react'
import { toast } from 'sonner'
import {
  acknowledgeAdminGeofenceBreach,
  acknowledgeAdminGeofenceBreaches,
  getAdminGeofenceBreachCounts,
  listAdminGeofenceBreaches,
  listAdminGeofences,
} from '@/lib/api-client'
import { formatAdminDateTime } from '@/lib/date-format'
import { handleServerError } from '@/lib/handle-server-error'
import { adminQueryKeys } from '@/features/admin/query-keys'
import { RecordPreviewLink } from '@/features/admin/components/record-preview-link'
import { usePrefetchRelatedRecords } from '@/features/admin/hooks/use-prefetch-related-records'
import {
  AckStateBadge,
  ContainmentBadge,
  DeviceStatusBadge,
  GeofenceEventBadge,
  GeofenceStatusBadge,
} from '@/features/admin/components/status-badge'
import { PageBasedPagination } from '@/components/data-table'
import { Main } from '@/components/layout/main'
import { PageHeader } from '@/components/patterns/page-header'
import { Stat, StatStrip } from '@/components/patterns/stat-strip'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { EventTable } from '@/components/patterns/event-table'

const route = getRouteApi('/_authenticated/geofences/')

export function GeofencesPage() {
  const search = route.useSearch()
  const navigate = route.useNavigate()
  const [selectedBreachIds, setSelectedBreachIds] = useState<string[]>([])

  const geofencesQuery = useQuery({
    queryKey: adminQueryKeys.geofences.list(search),
    queryFn: () => listAdminGeofences(search),
  })
  const breachesQuery = useQuery({
    queryKey: adminQueryKeys.breaches.list({
      page: search.page,
      pageSize: search.pageSize,
      acknowledged: search.acknowledged,
      search: search.search,
      sort: 'occurredAt',
      dir: 'desc',
    }),
    queryFn: () =>
      listAdminGeofenceBreaches({
        page: search.page,
        pageSize: search.pageSize,
        acknowledged: search.acknowledged,
        search: search.search,
        sort: 'occurredAt',
        dir: 'desc',
      }),
  })
  const countsQuery = useQuery({
    queryKey: adminQueryKeys.geofences.breachCounts(),
    queryFn: getAdminGeofenceBreachCounts,
  })

  const acknowledgeOneMutation = useMutation({
    mutationFn: (eventId: string) =>
      acknowledgeAdminGeofenceBreach(eventId, {
        note: 'Acknowledged from admin queue.',
      }),
    onSuccess: async () => {
      await Promise.all([
        geofencesQuery.refetch(),
        breachesQuery.refetch(),
        countsQuery.refetch(),
      ])
      toast.success('Breach acknowledged.')
    },
    onError: handleServerError,
  })
  const acknowledgeSelectedMutation = useMutation({
    mutationFn: () =>
      acknowledgeAdminGeofenceBreaches({
        eventIds: selectedBreachIds,
        note: 'Acknowledged from admin queue.',
      }),
    onSuccess: async () => {
      setSelectedBreachIds([])
      await Promise.all([
        geofencesQuery.refetch(),
        breachesQuery.refetch(),
        countsQuery.refetch(),
      ])
      toast.success('Selected breaches acknowledged.')
    },
    onError: handleServerError,
  })

  const visibleRelations = useMemo(
    () => [
      ...(geofencesQuery.data?.items ?? []).flatMap((item) => [
        { type: 'child' as const, id: item.childId },
        { type: 'device' as const, id: item.activeDevice?.id },
        { type: 'family' as const, id: item.family.id },
      ]),
      ...(breachesQuery.data?.items ?? []).flatMap((item) => [
        { type: 'child' as const, id: item.child.id },
        { type: 'device' as const, id: item.device?.id },
        { type: 'family' as const, id: item.family.id },
        { type: 'geofence' as const, id: item.geofenceId },
      ]),
    ],
    [breachesQuery.data?.items, geofencesQuery.data?.items]
  )
  usePrefetchRelatedRecords(visibleRelations)

  const currentPage = search.page ?? 1
  const currentPageSize = search.pageSize ?? 20
  const activeTotal =
    search.view === 'breaches'
      ? breachesQuery.data?.total
      : geofencesQuery.data?.total

  useEffect(() => {
    if (activeTotal == null) return

    const lastPage = Math.max(1, Math.ceil(activeTotal / currentPageSize))
    if (currentPage > lastPage) {
      navigate({
        replace: true,
        search: (prev) => ({
          ...prev,
          page: lastPage === 1 ? undefined : lastPage,
        }),
      })
    }
  }, [activeTotal, currentPage, currentPageSize, navigate])

  const updateSearch = (next: Record<string, unknown>) =>
    navigate({
      search: (prev) => ({
        ...prev,
        ...next,
        page: 1,
      }),
    })

  const updatePagination = (page: number, pageSize: number) => {
    if (search.view === 'breaches') setSelectedBreachIds([])
    navigate({
      search: (prev) => ({
        ...prev,
        page: page === 1 ? undefined : page,
        pageSize: pageSize === 20 ? undefined : pageSize,
      }),
    })
  }

  return (
    <>
      <Main>
        <PageHeader
          title='Geofences'
          description='Containment, live location and breach acknowledgements across children.'
        />

        <StatStrip className='lg:max-w-xl'>
          <Stat
            label='Unacknowledged breaches'
            value={countsQuery.data?.unacknowledged ?? '—'}
            hint={
              countsQuery.data?.unacknowledged ? (
                <span className='text-breach'>Needs acknowledgement</span>
              ) : (
                'All clear'
              )
            }
          />
          <Stat
            label='Acknowledged'
            value={countsQuery.data?.acknowledged ?? '—'}
          />
        </StatStrip>

        <Tabs
          value={search.view}
          onValueChange={(value) => updateSearch({ view: value })}
          className='gap-4'
        >
          <TabsList variant='line'>
            <TabsTrigger value='geofences'>Geofences</TabsTrigger>
            <TabsTrigger value='breaches'>Breaches</TabsTrigger>
          </TabsList>

          <TabsContent value='geofences' className='flex flex-col gap-3'>
            <div className='flex flex-wrap items-center gap-2 [&>[data-slot=select-trigger]]:w-44'>
              <Input
                className='w-full sm:w-64'
                value={search.search ?? ''}
                placeholder='Search child, family, or hardware ID'
                onChange={(event) =>
                  updateSearch({ search: event.target.value })
                }
              />
              <Select
                value={search.status ?? 'all'}
                onValueChange={(value) =>
                  updateSearch({ status: value === 'all' ? undefined : value })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder='Status' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='all'>All statuses</SelectItem>
                  <SelectItem value='enabled'>Enabled</SelectItem>
                  <SelectItem value='disabled'>Disabled</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={search.containmentState ?? 'all'}
                onValueChange={(value) =>
                  updateSearch({
                    containmentState: value === 'all' ? undefined : value,
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder='Containment' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='all'>All containment</SelectItem>
                  <SelectItem value='inside'>Inside</SelectItem>
                  <SelectItem value='outside'>Outside</SelectItem>
                  <SelectItem value='unknown'>Unknown</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={search.breachState ?? 'all'}
                onValueChange={(value) =>
                  updateSearch({
                    breachState: value === 'all' ? undefined : value,
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder='Breach state' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='all'>All breach states</SelectItem>
                  <SelectItem value='breached'>Breached</SelectItem>
                  <SelectItem value='clear'>Clear</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className='overflow-hidden rounded-lg bg-canvas p-4 shadow-[inset_0_0_0_1px_var(--line-faint)]'>
              <EventTable>
                <thead>
                  <tr>
                    <th>Child</th>
                    <th>Device</th>
                    <th>Family</th>
                    <th>Status</th>
                    <th>Containment</th>
                    <th>Live latitude</th>
                    <th>Live longitude</th>
                    <th>Radius</th>
                    <th>Last evaluated</th>
                    <th>Breaches</th>
                  </tr>
                </thead>
                <tbody>
                  {(geofencesQuery.data?.items ?? []).map((item) => (
                    <tr key={item.id}>
                      <td>
                        <RecordPreviewLink
                          type='child'
                          id={item.childId}
                          label={item.childName}
                        />
                      </td>
                      <td>
                        {item.activeDevice ? (
                          <div className='space-y-1'>
                            <RecordPreviewLink
                              type='device'
                              id={item.activeDevice.id}
                              label={item.activeDevice.hardwareIdentifier}
                            />
                            <div className='text-xs'>
                              <DeviceStatusBadge
                                status={item.activeDevice.status}
                              />
                            </div>
                          </div>
                        ) : (
                          <span className='text-ink-3'>No active device</span>
                        )}
                      </td>
                      <td>
                        <RecordPreviewLink
                          type='family'
                          id={item.family.id}
                          label={item.family.familyName ?? item.family.name}
                        />
                      </td>
                      <td>
                        <GeofenceStatusBadge status={item.status} />
                      </td>
                      <td>
                        <ContainmentBadge state={item.containmentState} />
                      </td>
                      <td className='font-mono text-xs'>
                        {item.lastLatitude?.toFixed(5) ?? '—'}
                      </td>
                      <td className='font-mono text-xs'>
                        {item.lastLongitude?.toFixed(5) ?? '—'}
                      </td>
                      <td>
                        {item.radiusMeters != null
                          ? `${item.radiusMeters}m`
                          : 'Not set'}
                      </td>
                      <td>{formatAdminDateTime(item.lastEvaluatedAt)}</td>
                      <td>
                        <Button
                          variant='ghost'
                          size='sm'
                          onClick={() =>
                            navigate({
                              to: '/geofences/$geofenceId',
                              params: { geofenceId: item.id },
                            })
                          }
                        >
                          {item.unacknowledgedBreachCount}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </EventTable>
            </div>
            <PageBasedPagination
              page={currentPage}
              pageSize={currentPageSize}
              total={geofencesQuery.data?.total ?? 0}
              onPageChange={(page) => updatePagination(page, currentPageSize)}
              onPageSizeChange={(pageSize) => updatePagination(1, pageSize)}
            />
          </TabsContent>

          <TabsContent value='breaches' className='flex flex-col gap-3'>
            <div className='flex flex-wrap items-center gap-3'>
              <Button
                disabled={
                  selectedBreachIds.length === 0 ||
                  acknowledgeSelectedMutation.isPending
                }
                onClick={() => acknowledgeSelectedMutation.mutate()}
              >
                Acknowledge selected
              </Button>
              <Select
                value={search.acknowledged ?? 'false'}
                onValueChange={(value) =>
                  updateSearch({
                    acknowledged: value === 'all' ? undefined : value,
                  })
                }
              >
                <SelectTrigger className='w-[220px]'>
                  <SelectValue placeholder='Ack state' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='false'>Unacknowledged</SelectItem>
                  <SelectItem value='true'>Acknowledged</SelectItem>
                  <SelectItem value='all'>All breaches</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className='overflow-hidden rounded-lg bg-canvas p-4 shadow-[inset_0_0_0_1px_var(--line-faint)]'>
              <EventTable>
                <thead>
                  <tr>
                    <th className='w-10'>
                      <span className='sr-only'>Select</span>
                    </th>
                    <th>Occurred</th>
                    <th>Child</th>
                    <th>Device</th>
                    <th>Geofence</th>
                    <th>Family</th>
                    <th>Distance / radius</th>
                    <th>State</th>
                    <th>Ack</th>
                  </tr>
                </thead>
                <tbody>
                  {(breachesQuery.data?.items ?? []).map((item) => {
                    const acknowledged = Boolean(item.acknowledgment)
                    const selected = selectedBreachIds.includes(item.id)

                    return (
                      <tr
                        key={item.id}
                        data-state={selected ? 'selected' : undefined}
                        className={
                          selected
                            ? 'bg-here-wash [&>td:first-child]:trail-edge'
                            : acknowledged
                              ? undefined
                              : 'bg-breach-wash/40'
                        }
                      >
                        <td>
                          <Checkbox
                            aria-label='Select breach'
                            checked={selected}
                            onCheckedChange={(value) =>
                              setSelectedBreachIds((prev) =>
                                value === true
                                  ? [...prev, item.id]
                                  : prev.filter((entry) => entry !== item.id)
                              )
                            }
                          />
                        </td>
                        <td>{formatAdminDateTime(item.occurredAt)}</td>
                        <td>
                          <RecordPreviewLink
                            type='child'
                            id={item.child.id}
                            label={item.child.name}
                          />
                        </td>
                        <td>
                          {item.device ? (
                            <RecordPreviewLink
                              type='device'
                              id={item.device.id}
                              label={item.device.hardwareIdentifier}
                            />
                          ) : (
                            'No device'
                          )}
                        </td>
                        <td>
                          <RecordPreviewLink
                            type='geofence'
                            id={item.geofenceId}
                            label='Open geofence'
                          />
                        </td>
                        <td>
                          <RecordPreviewLink
                            type='family'
                            id={item.family.id}
                            label={item.family.familyName ?? item.family.name}
                          />
                        </td>
                        <td>
                          {item.distanceMeters != null &&
                          item.radiusMeters != null
                            ? `${item.distanceMeters.toFixed(0)}m / ${item.radiusMeters}m`
                            : 'Unknown'}
                        </td>
                        <td>
                          <div className='flex flex-col gap-2'>
                            <GeofenceEventBadge eventType={item.eventType} />
                            <AckStateBadge acknowledged={acknowledged} />
                          </div>
                        </td>
                        <td>
                          <Button
                            variant='ghost'
                            size='icon'
                            aria-label='Acknowledge breach'
                            disabled={
                              acknowledged || acknowledgeOneMutation.isPending
                            }
                            onClick={() =>
                              acknowledgeOneMutation.mutate(item.id)
                            }
                          >
                            <Check className='size-4' />
                          </Button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </EventTable>
            </div>
            <PageBasedPagination
              page={currentPage}
              pageSize={currentPageSize}
              total={breachesQuery.data?.total ?? 0}
              onPageChange={(page) => updatePagination(page, currentPageSize)}
              onPageSizeChange={(pageSize) => updatePagination(1, pageSize)}
            />
          </TabsContent>
        </Tabs>
      </Main>
    </>
  )
}
