import { useState } from 'react'
import { getRouteApi } from '@tanstack/react-router'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Check, MapPinned } from 'lucide-react'
import { toast } from 'sonner'
import {
  acknowledgeAdminGeofenceBreach,
  acknowledgeAdminGeofenceBreaches,
  getAdminGeofence,
  listAdminGeofenceEvents,
} from '@/lib/api-client'
import { formatAdminDateTime } from '@/lib/date-format'
import { handleServerError } from '@/lib/handle-server-error'
import { adminQueryKeys } from '@/features/admin/query-keys'
import { GoogleMapPanel } from '@/features/admin/components/google-map-panel'
import { RecordPageHeader } from '@/features/admin/components/record-page-header'
import { RecordPreviewLink } from '@/features/admin/components/record-preview-link'
import { RelationshipPanel } from '@/features/admin/components/relationship-panel'
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
import { EmptyState } from '@/components/patterns/states'
import { Panel } from '@/components/patterns/panel'
import { KeyValue, KeyValueList } from '@/components/patterns/key-value'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { EventTable } from '@/components/patterns/event-table'

const route = getRouteApi('/_authenticated/geofences/$geofenceId')

export function GeofenceDetailPage() {
  const { geofenceId } = route.useParams()
  const [selectedEventIds, setSelectedEventIds] = useState<string[]>([])
  const [eventPagination, setEventPagination] = useState({
    page: 1,
    pageSize: 20,
  })
  const [breachPagination, setBreachPagination] = useState({
    page: 1,
    pageSize: 20,
  })
  const detailQuery = useQuery({
    queryKey: adminQueryKeys.geofences.detail(geofenceId),
    queryFn: () => getAdminGeofence(geofenceId),
  })
  const eventsQuery = useQuery({
    queryKey: adminQueryKeys.geofences.events(geofenceId, {
      page: eventPagination.page,
      pageSize: eventPagination.pageSize,
    }),
    queryFn: () =>
      listAdminGeofenceEvents(geofenceId, {
        page: eventPagination.page,
        pageSize: eventPagination.pageSize,
      }),
  })
  const breachesQuery = useQuery({
    queryKey: adminQueryKeys.geofences.events(geofenceId, {
      page: breachPagination.page,
      pageSize: breachPagination.pageSize,
      eventType: 'breached',
    }),
    queryFn: () =>
      listAdminGeofenceEvents(geofenceId, {
        page: breachPagination.page,
        pageSize: breachPagination.pageSize,
        eventType: 'breached',
      }),
  })

  const ackOneMutation = useMutation({
    mutationFn: (eventId: string) =>
      acknowledgeAdminGeofenceBreach(eventId, {
        note: 'Acknowledged from geofence detail.',
      }),
    onSuccess: async () => {
      await Promise.all([
        detailQuery.refetch(),
        eventsQuery.refetch(),
        breachesQuery.refetch(),
      ])
      toast.success('Breach acknowledged.')
    },
    onError: handleServerError,
  })
  const ackManyMutation = useMutation({
    mutationFn: () =>
      acknowledgeAdminGeofenceBreaches({
        eventIds: selectedEventIds,
        note: 'Acknowledged from geofence detail.',
      }),
    onSuccess: async () => {
      setSelectedEventIds([])
      await Promise.all([
        detailQuery.refetch(),
        eventsQuery.refetch(),
        breachesQuery.refetch(),
      ])
      toast.success('Selected breaches acknowledged.')
    },
    onError: handleServerError,
  })

  const geofence = detailQuery.data

  usePrefetchRelatedRecords([
    { type: 'child' as const, id: geofence?.childId },
    { type: 'device' as const, id: geofence?.activeDevice?.id },
    { type: 'family' as const, id: geofence?.family.id },
  ])

  return (
    <>
      <Main>
        <RecordPageHeader
          backTo='/geofences'
          title={geofence?.childName ?? 'Geofence'}
          description='Containment state, linked records and breach history.'
          icon={<MapPinned />}
          meta={
            geofence ? (
              <>
                <GeofenceStatusBadge status={geofence.status} />
                <ContainmentBadge state={geofence.containmentState} />
              </>
            ) : null
          }
          onRefresh={() => {
            void detailQuery.refetch()
            void eventsQuery.refetch()
            void breachesQuery.refetch()
          }}
          refreshing={
            detailQuery.isFetching ||
            eventsQuery.isFetching ||
            breachesQuery.isFetching
          }
        />

        {!geofence ? (
          <Panel>
            <EmptyState
              compact
              title={
                detailQuery.isLoading
                  ? 'Loading geofence…'
                  : 'Geofence not found'
              }
            />
          </Panel>
        ) : (
          <Tabs defaultValue='details' className='gap-4'>
            <TabsList variant='line'>
              <TabsTrigger value='details'>Details</TabsTrigger>
              <TabsTrigger value='events'>Live and past events</TabsTrigger>
              <TabsTrigger value='breaches' className='group'>
                Breaches
                {geofence.unacknowledgedBreachCount > 0 ? (
                  <span className='rounded-full bg-breach-wash px-1.5 text-2xs font-semibold text-breach tabular-nums'>
                    {geofence.unacknowledgedBreachCount}
                  </span>
                ) : null}
              </TabsTrigger>
            </TabsList>

            <TabsContent value='details' className='flex flex-col gap-4'>
              <div className='grid gap-4 xl:grid-cols-[minmax(360px,1fr)_minmax(0,1.2fr)]'>
                <RelationshipPanel title='Geofence state'>
                  <KeyValueList columns={2}>
                    <KeyValue
                      label='Child'
                      value={
                        <RecordPreviewLink
                          type='child'
                          id={geofence.childId}
                          label={geofence.childName}
                        />
                      }
                    />
                    <KeyValue
                      label='Device'
                      value={
                        geofence.activeDevice ? (
                          <div className='flex flex-wrap items-center gap-2'>
                            <RecordPreviewLink
                              type='device'
                              id={geofence.activeDevice.id}
                              label={geofence.activeDevice.hardwareIdentifier}
                            />
                            <DeviceStatusBadge
                              status={geofence.activeDevice.status}
                            />
                          </div>
                        ) : (
                          'No active device'
                        )
                      }
                    />
                    <KeyValue
                      label='Family'
                      value={
                        <RecordPreviewLink
                          type='family'
                          id={geofence.family.id}
                          label={
                            geofence.family.familyName ?? geofence.family.name
                          }
                        />
                      }
                    />
                    <KeyValue
                      label='Status'
                      value={<GeofenceStatusBadge status={geofence.status} />}
                    />
                    <KeyValue
                      label='Containment'
                      value={
                        <ContainmentBadge state={geofence.containmentState} />
                      }
                    />
                    <KeyValue
                      label='Radius'
                      value={
                        geofence.radiusMeters != null
                          ? `${geofence.radiusMeters}m`
                          : 'Not set'
                      }
                    />
                    <KeyValue
                      label='Distance from center'
                      value={
                        geofence.lastDistanceMeters != null
                          ? `${geofence.lastDistanceMeters.toFixed(0)}m`
                          : 'Unknown'
                      }
                    />
                    <KeyValue
                      label='Breached at'
                      value={formatAdminDateTime(geofence.breachedAt)}
                    />
                    <KeyValue
                      label='Reentered at'
                      value={formatAdminDateTime(geofence.lastReenteredAt)}
                    />
                    <KeyValue
                      label='Last evaluated'
                      value={formatAdminDateTime(geofence.lastEvaluatedAt)}
                    />
                  </KeyValueList>
                </RelationshipPanel>

                <RelationshipPanel title='Map'>
                  <GoogleMapPanel
                    latitude={geofence.lastLatitude ?? geofence.centerLatitude}
                    longitude={
                      geofence.lastLongitude ?? geofence.centerLongitude
                    }
                    label={geofence.childName}
                    pinLabel={geofence.childName.slice(0, 1)}
                    heightClassName='h-[420px]'
                    geofence={
                      geofence.centerLatitude != null &&
                      geofence.centerLongitude != null &&
                      geofence.radiusMeters != null
                        ? {
                            latitude: geofence.centerLatitude,
                            longitude: geofence.centerLongitude,
                            radiusMeters: geofence.radiusMeters,
                            tone:
                              geofence.containmentState === 'outside'
                                ? 'breach'
                                : 'ok',
                          }
                        : null
                    }
                  />
                </RelationshipPanel>
              </div>
            </TabsContent>

            <TabsContent value='events' className='flex flex-col gap-4'>
              <RelationshipPanel title='Event timeline'>
                <EventsTable
                  events={eventsQuery.data?.items ?? []}
                  selectable={false}
                  selectedIds={[]}
                  onToggleSelected={() => {}}
                  onAcknowledge={(eventId) => ackOneMutation.mutate(eventId)}
                  acknowledgePending={ackOneMutation.isPending}
                />
                <PageBasedPagination
                  page={eventPagination.page}
                  pageSize={eventPagination.pageSize}
                  total={eventsQuery.data?.total ?? 0}
                  onPageChange={(page) =>
                    setEventPagination((current) => ({ ...current, page }))
                  }
                  onPageSizeChange={(pageSize) =>
                    setEventPagination({ page: 1, pageSize })
                  }
                  className='pt-3'
                />
              </RelationshipPanel>
            </TabsContent>

            <TabsContent value='breaches' className='flex flex-col gap-4'>
              <RelationshipPanel
                title='Breached events'
                actions={
                  <Button
                    size='sm'
                    disabled={
                      selectedEventIds.length === 0 || ackManyMutation.isPending
                    }
                    onClick={() => ackManyMutation.mutate()}
                  >
                    <Check />
                    Acknowledge selected
                    {selectedEventIds.length
                      ? ` (${selectedEventIds.length})`
                      : ''}
                  </Button>
                }
              >
                <EventsTable
                  events={breachesQuery.data?.items ?? []}
                  selectable
                  selectedIds={selectedEventIds}
                  onToggleSelected={(eventId, checked) =>
                    setSelectedEventIds((prev) =>
                      checked
                        ? [...prev, eventId]
                        : prev.filter((value) => value !== eventId)
                    )
                  }
                  onAcknowledge={(eventId) => ackOneMutation.mutate(eventId)}
                  acknowledgePending={ackOneMutation.isPending}
                />
                <PageBasedPagination
                  page={breachPagination.page}
                  pageSize={breachPagination.pageSize}
                  total={breachesQuery.data?.total ?? 0}
                  onPageChange={(page) => {
                    setSelectedEventIds([])
                    setBreachPagination((current) => ({ ...current, page }))
                  }}
                  onPageSizeChange={(pageSize) => {
                    setSelectedEventIds([])
                    setBreachPagination({ page: 1, pageSize })
                  }}
                  className='pt-3'
                />
              </RelationshipPanel>
            </TabsContent>
          </Tabs>
        )}
      </Main>
    </>
  )
}

function EventsTable({
  events,
  selectable,
  selectedIds,
  onToggleSelected,
  onAcknowledge,
  acknowledgePending,
}: {
  events: Array<{
    id: string
    geofenceId: string
    child: { id: string; name: string }
    device: {
      id: string
      hardwareIdentifier: string
      displayName: string | null
    } | null
    family: { id: string; name: string; familyName: string | null }
    eventType: 'breached' | 'reentered' | 'reset'
    distanceMeters: number | null
    radiusMeters: number | null
    occurredAt: string
    acknowledgment: { acknowledgedAt: string; note: string | null } | null
  }>
  selectable: boolean
  selectedIds: string[]
  onToggleSelected: (eventId: string, checked: boolean) => void
  onAcknowledge: (eventId: string) => void
  acknowledgePending: boolean
}) {
  return (
    <EventTable>
      <thead>
        <tr>
          {selectable ? (
            <th className='w-10'>
              <span className='sr-only'>Select</span>
            </th>
          ) : null}
          <th>Occurred</th>
          <th>Child</th>
          <th>Device</th>
          <th>Family</th>
          <th>Type</th>
          <th>Distance / radius</th>
          <th>Ack</th>
        </tr>
      </thead>
      <tbody>
        {events.map((event) => {
          const acknowledged = Boolean(event.acknowledgment)
          return (
            <tr key={event.id}>
              {selectable ? (
                <td>
                  <Checkbox
                    aria-label='Select event'
                    checked={selectedIds.includes(event.id)}
                    onCheckedChange={(value) =>
                      onToggleSelected(event.id, value === true)
                    }
                  />
                </td>
              ) : null}
              <td>{formatAdminDateTime(event.occurredAt)}</td>
              <td>
                <RecordPreviewLink
                  type='child'
                  id={event.child.id}
                  label={event.child.name}
                />
              </td>
              <td>
                {event.device ? (
                  <RecordPreviewLink
                    type='device'
                    id={event.device.id}
                    label={event.device.hardwareIdentifier}
                  />
                ) : (
                  'No device'
                )}
              </td>
              <td>
                <RecordPreviewLink
                  type='family'
                  id={event.family.id}
                  label={event.family.familyName ?? event.family.name}
                />
              </td>
              <td>
                <GeofenceEventBadge eventType={event.eventType} />
              </td>
              <td>
                {event.distanceMeters != null && event.radiusMeters != null
                  ? `${event.distanceMeters.toFixed(0)}m / ${event.radiusMeters}m`
                  : 'Unknown'}
              </td>
              <td>
                <div className='flex items-center gap-2'>
                  <AckStateBadge acknowledged={acknowledged} />
                  <Button
                    variant='ghost'
                    size='icon'
                    aria-label='Acknowledge breach'
                    disabled={acknowledged || acknowledgePending}
                    onClick={() => onAcknowledge(event.id)}
                  >
                    <Check className='size-4' />
                  </Button>
                </div>
              </td>
            </tr>
          )
        })}
      </tbody>
    </EventTable>
  )
}
