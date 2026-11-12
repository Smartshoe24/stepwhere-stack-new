import { Link } from '@tanstack/react-router'
import { useQueries, useQuery } from '@tanstack/react-query'
import type { AdminDeviceConnectionState } from '@stepwhere/types'
import { ArrowRight } from 'lucide-react'
import {
  getAdminGeofenceBreachCounts,
  listAdminChildren,
  listAdminDevices,
  listAdminFamilies,
  listAdminGeofenceBreaches,
} from '@/lib/api-client'
import { formatAdminDateTime } from '@/lib/date-format'
import { adminQueryKeys } from '@/features/admin/query-keys'
import { LastSeenFreshness } from '@/features/admin/components/admin-last-seen'
import { RecordPreviewLink } from '@/features/admin/components/record-preview-link'
import { LiveDeviceConnectionBadge } from '@/features/devices/components/telemetry-reliability'
import { Main } from '@/components/layout/main'
import { EventTable, EventTableEmpty } from '@/components/patterns/event-table'
import { LiveBadge } from '@/components/patterns/live'
import { PageHeader } from '@/components/patterns/page-header'
import { Panel } from '@/components/patterns/panel'
import { Stat, StatStrip } from '@/components/patterns/stat-strip'
import { Button } from '@/components/ui/button'

const REFRESH_MS = 30_000
const connectionStates: AdminDeviceConnectionState[] = [
  'connected',
  'stale',
  'offline',
]

/** Operations overview built from the existing list endpoints' totals. */
export function Overview() {
  const totalsQueries = useQueries({
    queries: [
      {
        queryKey: adminQueryKeys.devices.list({ page: 1, pageSize: 1 }),
        queryFn: () => listAdminDevices({ page: 1, pageSize: 1 }),
        refetchInterval: REFRESH_MS,
      },
      ...connectionStates.map((connection) => ({
        queryKey: adminQueryKeys.devices.list({
          page: 1,
          pageSize: 1,
          connection,
        }),
        queryFn: () => listAdminDevices({ page: 1, pageSize: 1, connection }),
        refetchInterval: REFRESH_MS,
      })),
      {
        queryKey: adminQueryKeys.children.list({ page: 1, pageSize: 1 }),
        queryFn: () => listAdminChildren({ page: 1, pageSize: 1 }),
      },
      {
        queryKey: adminQueryKeys.families.list({ page: 1, pageSize: 1 }),
        queryFn: () => listAdminFamilies({ page: 1, pageSize: 1 }),
      },
    ],
  })
  const [allDevices, connected, stale, offline, children, families] =
    totalsQueries.map((query) => query.data?.total)

  const breachCountsQuery = useQuery({
    queryKey: adminQueryKeys.geofences.breachCounts(),
    queryFn: getAdminGeofenceBreachCounts,
    refetchInterval: REFRESH_MS,
  })
  const openBreachesQuery = useQuery({
    queryKey: adminQueryKeys.breaches.list({
      page: 1,
      pageSize: 6,
      acknowledged: 'false',
    }),
    queryFn: () =>
      listAdminGeofenceBreaches({
        page: 1,
        pageSize: 6,
        acknowledged: 'false',
      }),
    refetchInterval: REFRESH_MS,
  })
  const staleDevicesQuery = useQuery({
    queryKey: adminQueryKeys.devices.list({
      page: 1,
      pageSize: 8,
      connection: 'stale',
      sort: 'lastSeenAt',
      dir: 'asc',
    }),
    queryFn: () =>
      listAdminDevices({
        page: 1,
        pageSize: 8,
        connection: 'stale',
        sort: 'lastSeenAt',
        dir: 'asc',
      }),
    refetchInterval: REFRESH_MS,
  })

  const refreshing =
    totalsQueries.some((query) => query.isFetching) ||
    breachCountsQuery.isFetching ||
    openBreachesQuery.isFetching ||
    staleDevicesQuery.isFetching
  const refresh = () => {
    totalsQueries.forEach((query) => void query.refetch())
    void breachCountsQuery.refetch()
    void openBreachesQuery.refetch()
    void staleDevicesQuery.refetch()
  }
  const unacknowledged = breachCountsQuery.data?.unacknowledged
  const ratio = (value?: number) =>
    value != null && allDevices ? value / allDevices : null

  return (
    <Main>
      <PageHeader
        title='Overview'
        description='Fleet health across every Stepwhere shoe, refreshed every 30 seconds.'
        meta={<LiveBadge>Live</LiveBadge>}
        onRefresh={refresh}
        refreshing={refreshing}
      />

      <StatStrip>
        <Stat
          label='Reporting now'
          value={connected ?? '—'}
          unit={allDevices != null ? `/ ${allDevices}` : undefined}
          meter={ratio(connected)}
          tone='ok'
          hint='Devices with a recent packet'
        />
        <Stat
          label='Stale'
          value={stale ?? '—'}
          meter={ratio(stale)}
          tone='caution'
          hint='Late but still in range'
        />
        <Stat
          label='Offline'
          value={offline ?? '—'}
          meter={ratio(offline)}
          tone='breach'
          hint='No packet for a long time'
        />
        <Stat
          label='Open breaches'
          value={unacknowledged ?? '—'}
          hint={
            unacknowledged ? (
              <span className='text-breach'>Needs acknowledgement</span>
            ) : (
              'All acknowledged'
            )
          }
        />
        <Stat
          label='Children'
          value={children ?? '—'}
          hint={`${families ?? '—'} families`}
        />
      </StatStrip>

      <div className='grid gap-4 xl:grid-cols-2'>
        <Panel
          title='Open breaches'
          description='Most recent unacknowledged geofence breaches.'
          actions={
            <Button asChild variant='ghost' size='sm'>
              <Link to='/geofences'>
                View all
                <ArrowRight />
              </Link>
            </Button>
          }
        >
          <EventTable>
            <thead>
              <tr>
                <th>Child</th>
                <th>Device</th>
                <th>Distance</th>
                <th>Occurred</th>
              </tr>
            </thead>
            <tbody>
              {(openBreachesQuery.data?.items ?? []).map((event) => (
                <tr key={event.id}>
                  <td>
                    <RecordPreviewLink
                      type='child'
                      id={event.child.id}
                      label={event.child.name}
                    />
                  </td>
                  <td className='font-mono text-xs'>
                    {event.device ? (
                      <RecordPreviewLink
                        type='device'
                        id={event.device.id}
                        label={event.device.hardwareIdentifier}
                      />
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className='tabular-nums'>
                    {event.distanceMeters != null && event.radiusMeters != null
                      ? `${event.distanceMeters.toFixed(0)}m / ${event.radiusMeters}m`
                      : '—'}
                  </td>
                  <td className='text-xs text-ink-3 tabular-nums'>
                    {formatAdminDateTime(event.occurredAt)}
                  </td>
                </tr>
              ))}
              {openBreachesQuery.data &&
              openBreachesQuery.data.items.length === 0 ? (
                <EventTableEmpty colSpan={4}>No open breaches.</EventTableEmpty>
              ) : null}
              {openBreachesQuery.isLoading ? (
                <EventTableEmpty colSpan={4}>Loading breaches…</EventTableEmpty>
              ) : null}
            </tbody>
          </EventTable>
        </Panel>

        <Panel
          title='Longest stale'
          description='Devices that stopped reporting on time, oldest first.'
          actions={
            <Button asChild variant='ghost' size='sm'>
              <Link to='/devices' search={{ connection: 'stale' }}>
                View all
                <ArrowRight />
              </Link>
            </Button>
          }
        >
          <EventTable>
            <thead>
              <tr>
                <th>Device</th>
                <th>Bound to</th>
                <th>Connection</th>
                <th>Last seen</th>
              </tr>
            </thead>
            <tbody>
              {(staleDevicesQuery.data?.items ?? []).map((device) => (
                <tr key={device.id}>
                  <td className='font-mono text-xs'>
                    <RecordPreviewLink
                      type='device'
                      id={device.id}
                      label={device.hardwareIdentifier}
                    />
                  </td>
                  <td>
                    {device.activeBinding ? (
                      <RecordPreviewLink
                        type='child'
                        id={device.activeBinding.childId}
                        label={device.activeBinding.childName}
                      />
                    ) : (
                      <span className='text-ink-3'>Unbound</span>
                    )}
                  </td>
                  <td>
                    <LiveDeviceConnectionBadge device={device} />
                  </td>
                  <td>
                    <LastSeenFreshness value={device.lastSeenAt} />
                  </td>
                </tr>
              ))}
              {staleDevicesQuery.data &&
              staleDevicesQuery.data.items.length === 0 ? (
                <EventTableEmpty colSpan={4}>
                  Every device is reporting on time.
                </EventTableEmpty>
              ) : null}
              {staleDevicesQuery.isLoading ? (
                <EventTableEmpty colSpan={4}>Loading devices…</EventTableEmpty>
              ) : null}
            </tbody>
          </EventTable>
        </Panel>
      </div>
    </Main>
  )
}
