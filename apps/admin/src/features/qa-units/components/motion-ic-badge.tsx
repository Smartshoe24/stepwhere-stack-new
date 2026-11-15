import type { QaMotionIcDto } from '@stepwhere/types'
import { StatusBadge } from '@/features/admin/components/status-badge'

/*
 * Motion sensor (LIS2DH12) as the QA firmware proved it without motion: it
 * answers on I2C (imu test) and its built-in self-test moves the sensing
 * element on all three axes (steps test).
 */

const label = {
  passed: 'Working',
  failed: 'Failed',
  untested: 'Not tested',
} as const
const tone = { passed: 'success', failed: 'danger', untested: 'muted' } as const

export function MotionIcBadge({
  motionIc,
  showDetail = false,
}: {
  motionIc: QaMotionIcDto | null
  showDetail?: boolean
}) {
  if (!motionIc) return <span className='text-ink-4'>—</span>
  const title = [motionIc.chip, motionIc.detail].filter(Boolean).join(' · ')

  return (
    <span
      className='flex min-w-0 items-center gap-2'
      title={title || undefined}
    >
      <StatusBadge tone={tone[motionIc.status]}>
        {label[motionIc.status]}
      </StatusBadge>
      {showDetail && title ? (
        <span className='truncate text-xs text-ink-3'>{title}</span>
      ) : null}
    </span>
  )
}
