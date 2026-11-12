import { createFileRoute } from '@tanstack/react-router'
import { QaLayout } from '@/features/qa-units/components/qa-layout'

export const Route = createFileRoute('/_authenticated/qa')({
  component: QaLayout,
})
