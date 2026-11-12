import z from 'zod'
import { createFileRoute } from '@tanstack/react-router'
import { Children } from '@/features/children'

const childrenSearchSchema = z.object({
  page: z.number().optional().catch(1),
  pageSize: z.number().optional().catch(20),
  search: z.string().optional().catch(''),
  lifecycleStatus: z.enum(['active', 'archived']).optional().catch(undefined),
  trackingStatus: z.enum(['safe', 'transit', 'alert', 'offline']).optional().catch(undefined),
  telemetryState: z.enum(['active', 'sleep', 'offline', 'connecting']).optional().catch(undefined),
  binding: z.enum(['bound', 'unbound']).optional().catch(undefined),
  sort: z.enum(['createdAt', 'name', 'lastSeenAt', 'lifecycleStatus']).optional().catch('createdAt'),
  dir: z.enum(['asc', 'desc']).optional().catch('desc'),
})

export const Route = createFileRoute('/_authenticated/children/')({
  validateSearch: childrenSearchSchema,
  component: Children,
})
