import z from 'zod'
import { createFileRoute } from '@tanstack/react-router'
import { QaBench } from '@/features/qa-bench'

const benchSearchSchema = z.object({
  station: z.string().optional().catch(undefined),
  /** A bench with slots opens on its slot grid; `single` shows the one-board tools. */
  view: z.enum(['slots', 'single']).optional().catch(undefined),
})

export const Route = createFileRoute('/_authenticated/qa/bench')({
  validateSearch: benchSearchSchema,
  component: QaBench,
})
