import { createFileRoute } from '@tanstack/react-router'
import { PreviewAccessPage } from '@/features/preview-access'

export const Route = createFileRoute('/_authenticated/preview-access/')({
  component: PreviewAccessPage,
})
