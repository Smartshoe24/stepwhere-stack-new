import { createFileRoute } from '@tanstack/react-router'
import { ChildDetailPage } from '@/features/children/detail-page'

export const Route = createFileRoute('/_authenticated/children/$childId')({
  component: ChildDetailPage,
})
