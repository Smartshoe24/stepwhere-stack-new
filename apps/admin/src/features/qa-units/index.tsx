import { getRouteApi, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Wrench } from 'lucide-react'
import { getQaOverview, listQaUnits } from '@/lib/api-client'
import { adminQueryKeys } from '@/features/admin/query-keys'
import { Main } from '@/components/layout/main'
import { LiveBadge } from '@/components/patterns/live'
import { PageHeader } from '@/components/patterns/page-header'
import { Stat, StatStrip } from '@/components/patterns/stat-strip'
import { Button } from '@/components/ui/button'
import { UnitsTable } from './components/units-table'

const route = getRouteApi('/_authenticated/qa/units/')

export function QaUnits() {
  const search = route.useSearch()

  const unitsQuery = useQuery({
    queryKey: adminQueryKeys.qa.unitList(search),
    queryFn: () => listQaUnits(search),
  })
  const overviewQuery = useQuery({
    queryKey: adminQueryKeys.qa.overview(),
    queryFn: getQaOverview,
  })

  const overview = overviewQuery.data
  const delivered = overview?.byStage.find(
    (entry) => entry.stage === 'delivered'
  )
  const inQa = overview
    ? overview.byStage
        .filter(
          (entry) =>
            entry.stage !== 'ready_to_ship' &&
            entry.stage !== 'shipped' &&
            entry.stage !== 'delivered'
        )
        .reduce((sum, entry) => sum + entry.pending + entry.passed, 0)
    : null

  return (
    <Main>
      <PageHeader
        title='Units'
        description='Every board the Bench has seen, from first flash to the customer.'
        meta={unitsQuery.data ? <LiveBadge>Live</LiveBadge> : null}
        onRefresh={() => {
          void unitsQuery.refetch()
          void overviewQuery.refetch()
        }}
        refreshing={unitsQuery.isFetching}
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
        <Stat label='In QA' value={inQa ?? '—'} />
        <Stat
          label='Failed'
          value={overview?.failed ?? '—'}
          tone='breach'
          hint={overview?.failed ? 'Needs rework' : 'None failing'}
        />
        <Stat
          label='Ready to ship'
          value={
            overview?.byStage.find((entry) => entry.stage === 'ready_to_ship')
              ?.passed ?? '—'
          }
          tone='ok'
        />
        <Stat
          label='Delivered'
          value={delivered ? delivered.pending + delivered.passed : '—'}
          hint={
            overview
              ? `${overview.field.active} active · ${overview.field.offline} offline`
              : null
          }
        />
      </StatStrip>

      <UnitsTable
        data={unitsQuery.data?.items ?? []}
        total={unitsQuery.data?.total ?? 0}
        loading={unitsQuery.isLoading}
      />
    </Main>
  )
}
