import { useQuery } from '@tanstack/react-query'
import type { QaTestReportDto } from '@stepwhere/types'
import { getQaUnitTestLog } from '@/lib/api-client'
import { formatAdminDateTime } from '@/lib/date-format'
import { adminQueryKeys } from '@/features/admin/query-keys'
import { GoogleMapPanel } from '@/features/admin/components/google-map-panel'
import { StatusBadge } from '@/features/admin/components/status-badge'
import { EventTable, EventTableEmpty } from '@/components/patterns/event-table'
import { KeyValue, KeyValueList } from '@/components/patterns/key-value'
import { Panel } from '@/components/patterns/panel'
import { EmptyState } from '@/components/patterns/states'

/*
 * Test log: location uploads the board sent while in QA and not bound to a
 * child (QA firmware netloc test, or production firmware before Ready to
 * ship). The server looks up up to 10 Wi-Fi/GSM positions for QA firmware.
 */

/** Metres between the GPS fix and the Wi-Fi/GSM position of the same upload, if both exist. */
function distanceFromGps(entry: QaTestReportDto) {
  if (
    !entry.gpsFix ||
    entry.latitude == null ||
    entry.longitude == null ||
    entry.networkLatitude == null ||
    entry.networkLongitude == null
  ) {
    return null
  }
  const rad = Math.PI / 180
  const dLat = (entry.networkLatitude - entry.latitude) * rad
  const dLng = (entry.networkLongitude - entry.longitude) * rad
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(entry.latitude * rad) *
      Math.cos(entry.networkLatitude * rad) *
      Math.sin(dLng / 2) ** 2
  return 2 * 6_371_000 * Math.asin(Math.sqrt(a))
}

const coords = (lat: number, lng: number) =>
  `${lat.toFixed(5)}, ${lng.toFixed(5)}`

function networkCell(entry: QaTestReportDto) {
  if (!entry.networkLookup) return <span className='text-ink-4'>—</span>
  if (entry.networkLatitude != null && entry.networkLongitude != null) {
    return (
      <span className='font-mono text-xs'>
        {coords(entry.networkLatitude, entry.networkLongitude)}
        {entry.networkAccuracyMeters != null ? (
          <span className='text-ink-3'>
            {' '}
            ±{Math.round(entry.networkAccuracyMeters)} m
          </span>
        ) : null}
      </span>
    )
  }
  return (
    <span className='text-xs text-breach'>
      {entry.networkError ?? 'Lookup failed'}
    </span>
  )
}

export function TestLogPanel({ unitId }: { unitId: string }) {
  const logQuery = useQuery({
    queryKey: adminQueryKeys.qa.unitTestLog(unitId),
    queryFn: () => getQaUnitTestLog(unitId),
  })
  const log = logQuery.data

  if (!log) {
    return (
      <Panel>
        <EmptyState
          compact
          title={
            logQuery.isError
              ? 'Could not load the test log'
              : 'Loading test log'
          }
          description={logQuery.isError ? 'Reload the page to try again.' : ''}
        />
      </Panel>
    )
  }
  if (log.entries.length === 0) {
    return (
      <Panel>
        <EmptyState
          compact
          title='No uploads yet'
          description='The QA firmware sends 10 location uploads at the end of its run (netloc test). They land here, with the Wi-Fi/GSM positions the server looked up.'
        />
      </Panel>
    )
  }

  const located = log.entries.filter(
    (entry) => entry.networkLatitude != null && entry.networkLongitude != null
  )
  const gpsFixes = log.entries.filter(
    (entry) => entry.gpsFix && entry.latitude != null
  )
  // Map: the newest Wi-Fi/GSM position, else the newest GPS fix; older lookups as the trail.
  const pin = located[0]
    ? {
        latitude: located[0].networkLatitude!,
        longitude: located[0].networkLongitude!,
      }
    : gpsFixes[0]
      ? { latitude: gpsFixes[0].latitude!, longitude: gpsFixes[0].longitude! }
      : null
  const trail = located
    .slice()
    .reverse()
    .map((entry) => ({
      latitude: entry.networkLatitude!,
      longitude: entry.networkLongitude!,
    }))

  return (
    <div className='grid gap-4'>
      <Panel
        title='Wi-Fi/GSM location'
        actions={
          log.networkLocatedAt ? (
            <StatusBadge tone='success'>Passed</StatusBadge>
          ) : (
            <StatusBadge tone='muted'>Waiting</StatusBadge>
          )
        }
      >
        <KeyValueList>
          <KeyValue
            label='Lookups'
            value={`${log.networkLookups} of ${log.networkLookupMax}`}
          />
          <KeyValue
            label='Positions found'
            value={`${located.length} of ${log.entries.filter((entry) => entry.networkLookup).length} lookups`}
          />
          <KeyValue
            label='First position'
            value={
              log.networkLocatedAt
                ? formatAdminDateTime(log.networkLocatedAt)
                : null
            }
          />
          <KeyValue label='Uploads' value={`${log.total}`} />
        </KeyValueList>
        {pin ? (
          <GoogleMapPanel
            latitude={pin.latitude}
            longitude={pin.longitude}
            label={located[0] ? 'Newest Wi-Fi/GSM position' : 'Newest GPS fix'}
            trail={trail.length > 1 ? trail : null}
            heightClassName='h-64'
            className='mt-3'
          />
        ) : null}
      </Panel>

      <EventTable>
        <thead>
          <tr>
            <th>Received</th>
            <th>Firmware</th>
            <th>GPS</th>
            <th>Wi-Fi/GSM position</th>
            <th>From GPS</th>
            <th>Cell</th>
            <th>Wi-Fi</th>
            <th>Battery</th>
          </tr>
        </thead>
        <tbody>
          {log.entries.length === 0 ? (
            <EventTableEmpty colSpan={8}>No uploads yet.</EventTableEmpty>
          ) : (
            log.entries.map((entry) => (
              <tr key={entry.id}>
                <td className='text-xs tabular'>
                  {formatAdminDateTime(entry.receivedAt)}
                </td>
                <td className='font-mono text-xs'>{entry.firmware ?? '—'}</td>
                <td className='text-xs'>
                  {entry.gpsFix &&
                  entry.latitude != null &&
                  entry.longitude != null ? (
                    <span className='font-mono'>
                      {coords(entry.latitude, entry.longitude)}
                    </span>
                  ) : (
                    <span className='text-ink-3'>
                      No fix
                      {entry.satelliteCount
                        ? ` · ${entry.satelliteCount} sat`
                        : ''}
                    </span>
                  )}
                </td>
                <td>{networkCell(entry)}</td>
                <td className='text-xs tabular'>
                  {(() => {
                    const meters = distanceFromGps(entry)
                    return meters == null ? (
                      <span className='text-ink-4'>—</span>
                    ) : meters >= 1000 ? (
                      `${(meters / 1000).toFixed(1)} km`
                    ) : (
                      `${Math.round(meters)} m`
                    )
                  })()}
                </td>
                <td className='font-mono text-xs'>{entry.cell ?? '—'}</td>
                <td className='text-xs tabular'>{entry.wifiCount}</td>
                <td className='text-xs tabular'>
                  {entry.batteryVoltageMv != null
                    ? `${(entry.batteryVoltageMv / 1000).toFixed(2)} V`
                    : '—'}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </EventTable>
      {log.total > log.entries.length ? (
        <p className='text-xs text-ink-3'>
          Showing the newest {log.entries.length} of {log.total} uploads.
        </p>
      ) : null}
    </div>
  )
}
