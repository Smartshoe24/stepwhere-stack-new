import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import type { QaStationDto } from '@stepwhere/types'
import { ArrowUpRight } from 'lucide-react'
import { getQaStationUnit } from '@/lib/api-client'
import { adminQueryKeys } from '@/features/admin/query-keys'
import { AdminLastSeen } from '@/features/admin/components/admin-last-seen'
import { Panel } from '@/components/patterns/panel'
import { Button } from '@/components/ui/button'
import {
  StageBar,
  UnitStatusBadge,
} from '@/features/qa-units/components/stage-display'
import {
  formatChipUid,
  stageLabels,
  unitTitle,
} from '@/features/qa-units/lib/qa-unit-format'

/** The board last identified or flashed here, so the operator sees which unit they're holding. */
export function StationUnitPanel({ station }: { station: QaStationDto }) {
  const unitQuery = useQuery({
    queryKey: adminQueryKeys.qa.stationUnit(station.id),
    queryFn: () => getQaStationUnit(station.id),
  })
  const unit = unitQuery.data?.unit ?? null
  const current = unitQuery.data?.current ?? false

  return (
    <Panel
      title={unit && !current ? 'Last board here' : 'Board on this station'}
      actions={
        unit ? (
          <Button variant='ghost' size='sm' asChild>
            <Link to='/qa/units/$unitId' params={{ unitId: unit.id }}>
              Open unit
              <ArrowUpRight />
            </Link>
          </Button>
        ) : null
      }
    >
      {!unit ? (
        <p className='text-sm text-ink-3'>
          Identify or flash a board and it shows up here as a unit.
        </p>
      ) : (
        <div className='grid gap-3'>
          <div className='flex items-start justify-between gap-3'>
            <div className='min-w-0'>
              <Link
                to='/qa/units/$unitId'
                params={{ unitId: unit.id }}
                className='focus-trail block truncate rounded-xs font-mono text-sm font-semibold text-ink hover:text-act'
              >
                {unitTitle(unit)}
              </Link>
              <div className='mt-0.5 truncate font-mono text-2xs text-ink-4'>
                {formatChipUid(unit.chipUid)}
              </div>
            </div>
            <UnitStatusBadge unit={unit} />
          </div>
          <div className='flex items-center gap-3'>
            <StageBar stage={unit.stage} stageStatus={unit.stageStatus} />
            <span className='text-sm text-ink-2'>
              {stageLabels[unit.stage]}
            </span>
          </div>
          {unit.imei || !current ? null : (
            <p className='rounded-md bg-canvas px-3 py-2 text-xs text-ink-3 shadow-[inset_0_0_0_1px_var(--line-faint)]'>
              No IMEI yet. Open the serial console and reset the board; the
              firmware&rsquo;s <span className='font-mono'>[IMEI]</span> boot
              line links it automatically.
            </p>
          )}
          {unitQuery.data?.seenAt ? (
            <p className='text-xs text-ink-4'>
              Last job <AdminLastSeen value={unitQuery.data.seenAt} />
            </p>
          ) : null}
        </div>
      )}
    </Panel>
  )
}
