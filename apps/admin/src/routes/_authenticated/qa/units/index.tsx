import z from 'zod'
import { createFileRoute } from '@tanstack/react-router'
import { QA_UNIT_STAGE_STATUSES, QA_UNIT_STAGES } from '@stepwhere/types'
import { QaUnits } from '@/features/qa-units'

const unitsSearchSchema = z.object({
  page: z.number().optional().catch(1),
  pageSize: z.number().optional().catch(20),
  search: z.string().optional().catch(''),
  stage: z.enum(QA_UNIT_STAGES).optional().catch(undefined),
  status: z.enum(QA_UNIT_STAGE_STATUSES).optional().catch(undefined),
  sort: z
    .enum(['updatedAt', 'createdAt', 'stage', 'imei'])
    .optional()
    .catch('updatedAt'),
  dir: z.enum(['asc', 'desc']).optional().catch('desc'),
})

export const Route = createFileRoute('/_authenticated/qa/units/')({
  validateSearch: unitsSearchSchema,
  component: QaUnits,
})
