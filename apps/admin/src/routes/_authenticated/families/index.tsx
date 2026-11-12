import z from 'zod'
import { createFileRoute } from '@tanstack/react-router'
import { Families } from '@/features/families'

const familiesSearchSchema = z.object({
  page: z.number().optional().catch(1),
  pageSize: z.number().optional().catch(20),
  search: z.string().optional().catch(''),
  sort: z.enum(['createdAt', 'familyName']).optional().catch('createdAt'),
  dir: z.enum(['asc', 'desc']).optional().catch('desc'),
})

export const Route = createFileRoute('/_authenticated/families/')({
  validateSearch: familiesSearchSchema,
  component: Families,
})
