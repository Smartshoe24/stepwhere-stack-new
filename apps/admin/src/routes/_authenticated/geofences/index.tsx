import z from 'zod'
import { createFileRoute } from '@tanstack/react-router'
import { GeofencesPage } from '@/features/geofences/index'

const geofencesSearchSchema = z.object({
  view: z.enum(['geofences', 'breaches']).optional().catch('geofences'),
  page: z.number().optional().catch(1),
  pageSize: z.number().optional().catch(20),
  search: z.string().optional().catch(''),
  status: z.enum(['enabled', 'disabled']).optional().catch(undefined),
  containmentState: z.enum(['unknown', 'inside', 'outside']).optional().catch(undefined),
  breachState: z.enum(['clear', 'breached']).optional().catch(undefined),
  acknowledged: z.enum(['true', 'false']).optional().catch('false'),
})

export const Route = createFileRoute('/_authenticated/geofences/')({
  validateSearch: geofencesSearchSchema,
  component: GeofencesPage,
})
