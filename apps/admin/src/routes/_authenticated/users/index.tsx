import z from 'zod'
import { createFileRoute } from '@tanstack/react-router'
import { Users } from '@/features/users'

const usersSearchSchema = z.object({
  page: z.number().optional().catch(1),
  pageSize: z.number().optional().catch(20),
  search: z.string().optional().catch(''),
  role: z.enum(['user', 'admin']).optional().catch(undefined),
  status: z.enum(['active', 'suspended']).optional().catch(undefined),
  banned: z.enum(['true', 'false']).optional().catch(undefined),
  onboarding: z.enum(['completed', 'incomplete']).optional().catch(undefined),
  sort: z
    .enum(['createdAt', 'displayName', 'phoneNumber', 'lastSeenAt', 'role', 'status'])
    .optional()
    .catch('createdAt'),
  dir: z.enum(['asc', 'desc']).optional().catch('desc'),
})

export const Route = createFileRoute('/_authenticated/users/')({
  validateSearch: usersSearchSchema,
  component: Users,
})
