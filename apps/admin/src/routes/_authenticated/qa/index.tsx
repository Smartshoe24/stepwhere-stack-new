import { createFileRoute } from '@tanstack/react-router'
import { QaOverview } from '@/features/qa-units/overview-page'

export const Route = createFileRoute('/_authenticated/qa/')({
  component: QaOverview,
})
