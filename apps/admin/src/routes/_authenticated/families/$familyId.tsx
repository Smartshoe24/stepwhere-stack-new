import { createFileRoute } from '@tanstack/react-router'
import { FamilyDetailPage } from '@/features/families/detail-page'

export const Route = createFileRoute('/_authenticated/families/$familyId')({
  component: FamilyDetailPage,
})
