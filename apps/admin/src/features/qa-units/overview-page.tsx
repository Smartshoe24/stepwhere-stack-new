import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import type { QaOverviewDto } from '@stepwhere/types'
import { Wrench, X } from 'lucide-react'
import { getQaOverview } from '@/lib/api-client'
import { adminQueryKeys } from '@/features/admin/query-keys'
import { AdminLastSeen } from '@/features/admin/components/admin-last-seen'
import { Main } from '@/components/layout/main'
import { LiveBadge } from '@/components/patterns/live'
import { PageHeader } from '@/components/patterns/page-header'
import { Panel } from '@/components/patterns/panel'
import { EmptyState } from '@/components/patterns/states'
import { Stat, StatStrip } from '@/components/patterns/stat-strip'
import { Button } from '@/components/ui/button'
import { stageLabels, unitTitle } from './lib/qa-unit-format'

const IN_FLIGHT_STAGES = new Set([
  'registered',
  'qa_firmware',
  'board_tests',
  'production_firmware',
  'functional_tests',
  'assembled',
  'final_test',
])

function summarize(overview: QaOverviewDto) {
  const count = (stage: string) => {
    const entry = overview.byStage.find((item) => item.stage === stage)
    return entry ? entry.pending + entry.passed : 0
  }
  const inQa = overview.byStage
    .filter((entry) => IN_FLIGHT_STAGES.has(entry.stage))
    .reduce((sum, entry) => sum + entry.pending + entry.passed, 0)

  return {
    inQa,
    ready: count('ready_to_ship'),
    shipped: count('shipped'),
    delivered: count('delivered'),
  }
}

export function QaOverview() {
  const overviewQuery = useQuery({
    queryKey: adminQueryKeys.qa.overview(),
    queryFn: getQaOverview,
    refetchInterval: 60_000,
  })
  const overview = overviewQuery.data
  const totals = overview ? summarize(overview) : null
  const pipelineMax = overview
    ? Math.max(
        1,
        ...overview.byStage.map(
          (entry) => entry.pending + entry.passed + entry.failed
        )
      )
    : 1

  return (
    <Main>
      <PageHeader
        title='QA overview'
        description={
          overview && totals
            ? `${overview.total} units · ${totals.inQa} in QA · ${overview.failed} failed · ${totals.ready} ready to ship`
            : 'Where every board stands on the production line.'
        }
        meta={
          overview ? (
            <LiveBadge>
              {overview.stations.online} of {overview.stations.total} benches
              live
            </LiveBadge>
          ) : null
        }
        onRefresh={() => void overviewQuery.refetch()}
        refreshing={overviewQuery.isFetching}
        actions={
          <Button asChild>
            <Link to='/qa/bench'>
              <Wrench />
              Open bench
            </Link>
          </Button>
        }
      />

      <StatStrip>
        <Stat label='Total units' value={overview?.total ?? '—'} />
        <Stat label='In QA' value={totals?.inQa ?? '—'} tone='info' />
        <Stat
          label='Failed'
          value={overview?.failed ?? '—'}
          hint={overview ? `${overview.last24h.failed} in the last 24 h` : null}
        />
        <Stat label='Ready to ship' value={totals?.ready ?? '—'} />
        <Stat
          label='Shipped'
          value={totals?.shipped ?? '—'}
          hint='In transit'
        />
        <Stat label='Delivered' value={totals?.delivered ?? '—'} />
        <Stat
          label='Active'
          value={overview?.field.active ?? '—'}
          tone='ok'
          meter={
            totals?.delivered && overview
              ? overview.field.active / totals.delivered
              : null
          }
        />
        <Stat
          label='Offline'
          value={
            overview ? overview.field.offline + overview.field.neverSeen : '—'
          }
          hint='Silent > 24 h'
        />
      </StatStrip>

      <div className='grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_380px]'>
        <Panel
          title='Pipeline'
          description='Units at each stage right now. Click a stage to see them.'
        >
          {overview && overview.total === 0 ? (
            <EmptyState
              compact
              title='No units yet'
              description='Units appear the first time the Bench identifies or flashes a board.'
            />
          ) : (
            <ul className='grid gap-1'>
              {(overview?.byStage ?? []).map((entry) => {
                const total = entry.pending + entry.passed + entry.failed
                return (
                  <li key={entry.stage}>
                    <Link
                      to='/qa/units'
                      search={{ stage: entry.stage }}
                      className='focus-trail grid grid-cols-[140px_minmax(0,1fr)_64px] items-center gap-4 rounded-md px-2 py-1.5 transition-colors hover:bg-white/[0.03]'
                    >
                      <span className='text-sm text-ink-2'>
                        {stageLabels[entry.stage]}
                      </span>
                      <span className='flex h-1.5 overflow-hidden rounded-full bg-white/6'>
                        <i
                          className='block h-full bg-toggle'
                          style={{
                            width: `${((entry.pending + entry.passed) / pipelineMax) * 100}%`,
                          }}
                        />
                        <i
                          className='block h-full bg-breach'
                          style={{
                            width: `${(entry.failed / pipelineMax) * 100}%`,
                          }}
                        />
                      </span>
                      <span className='text-end text-sm text-ink tabular'>
                        {total}
                        {entry.failed > 0 ? (
                          <span className='ms-1 text-xs text-breach'>
                            {entry.failed}✕
                          </span>
                        ) : null}
                      </span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
          {overview && overview.scrapped > 0 ? (
            <p className='mt-3 px-2 text-xs text-ink-3'>
              {overview.scrapped} scrapped unit
              {overview.scrapped === 1 ? '' : 's'} not shown.
            </p>
          ) : null}
        </Panel>

        <div className='grid min-w-0 gap-4'>
          <StatStrip className='lg:grid-cols-3 lg:grid-flow-row'>
            <Stat
              label='Registered'
              value={overview?.last24h.registered ?? '—'}
              hint='Last 24 h'
            />
            <Stat
              label='Flashed'
              value={overview?.last24h.flashed ?? '—'}
              hint='Last 24 h'
            />
            <Stat
              label='Failed'
              value={overview?.last24h.failed ?? '—'}
              hint='Last 24 h'
            />
          </StatStrip>

          <Panel title='Recent failures' flush>
            {overview && overview.recentFailures.length === 0 ? (
              <p className='px-4 py-6 text-center text-sm text-ink-3'>
                No units failing right now.
              </p>
            ) : (
              <ul className='divide-y divide-line-faint'>
                {(overview?.recentFailures ?? []).map((unit) => (
                  <li key={unit.id}>
                    <Link
                      to='/qa/units/$unitId'
                      params={{ unitId: unit.id }}
                      className='focus-trail flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-white/[0.03]'
                    >
                      <X className='size-3.5 shrink-0 text-breach' />
                      <span className='min-w-0 flex-1'>
                        <span className='block truncate font-mono text-xs text-ink'>
                          {unitTitle(unit)}
                        </span>
                        <span className='block text-xs text-ink-3'>
                          {stageLabels[unit.stage]}
                          {unit.lastStationName
                            ? ` · ${unit.lastStationName}`
                            : ''}
                        </span>
                      </span>
                      <AdminLastSeen
                        value={unit.stageChangedAt}
                        className='shrink-0 text-xs text-ink-4'
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </Main>
  )
}
