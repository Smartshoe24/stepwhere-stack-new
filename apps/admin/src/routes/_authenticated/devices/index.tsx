import z from 'zod'
import { createFileRoute } from '@tanstack/react-router'
import { Devices } from '@/features/devices'

const devicesSearchSchema = z.object({
  page: z.number().optional().catch(1),
  pageSize: z.number().optional().catch(20),
  search: z.string().optional().catch(''),
  status: z.enum(['fresh', 'active', 'inactive', 'blocked']).optional().catch(undefined),
  platform: z.enum(['android', 'ios', 'embedded', 'unknown']).optional().catch(undefined),
  binding: z.enum(['bound', 'unbound']).optional().catch(undefined),
  connection: z
    .enum(['connected', 'stale', 'offline', 'sleep', 'never'])
    .optional()
    .catch(undefined),
  sort: z
    .enum(['createdAt', 'hardwareIdentifier', 'displayName', 'status', 'lastSeenAt', 'platform'])
    .optional()
    .catch('createdAt'),
  dir: z.enum(['asc', 'desc']).optional().catch('desc'),
})

export const Route = createFileRoute('/_authenticated/devices/')({
  validateSearch: devicesSearchSchema,
  component: Devices,
})
