import { createFileRoute } from '@tanstack/react-router'
import { QaUnitDetailPage } from '@/features/qa-units/detail-page'

export const Route = createFileRoute('/_authenticated/qa/units/$unitId')({
  component: QaUnitDetailPage,
})
