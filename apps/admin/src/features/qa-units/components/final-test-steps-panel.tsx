import { useQuery } from '@tanstack/react-query'
import type { QaUnitDetailDto } from '@stepwhere/types'
import { getQaUnitTestLog } from '@/lib/api-client'
import { adminQueryKeys } from '@/features/admin/query-keys'
import { StatusBadge } from '@/features/admin/components/status-badge'
import { KeyValue, KeyValueList } from '@/components/patterns/key-value'
import { Panel } from '@/components/patterns/panel'
import { stageIndex } from '../lib/qa-unit-format'

/*
 * Final test, with the board in its shoe: the operator moves the shoe over the
 * table like walking for about 30 s; the step counter in the uploads must rise
 * by the target. QA board tests already proved the sensor without motion.
 */
export function FinalTestStepsPanel({ unit }: { unit: QaUnitDetailDto }) {
  const reached = stageIndex(unit.stage) >= stageIndex('final_test')
  const logQuery = useQuery({
    queryKey: adminQueryKeys.qa.unitTestLog(unit.id),
    queryFn: () => getQaUnitTestLog(unit.id),
    enabled: reached,
  })
  if (!reached) return null

  const steps = logQuery.data?.finalTestSteps ?? null

  return (
    <Panel
      title='Final test: steps'
      actions={
        steps?.passed ? (
          <StatusBadge tone='success'>Passed</StatusBadge>
        ) : (
          <StatusBadge tone='muted'>Waiting</StatusBadge>
        )
      }
    >
      <KeyValueList>
        <KeyValue
          label='Step counter'
          value={
            steps
              ? `${steps.first} → ${steps.latest} (+${steps.increase} of ${steps.target})`
              : 'No upload in Final test yet'
          }
        />
        <KeyValue
          label='How'
          value={
            <span className='text-xs text-ink-3'>
              Move the shoe over the table like walking for about 30 s, then
              wait for the next upload.
            </span>
          }
        />
      </KeyValueList>
    </Panel>
  )
}
