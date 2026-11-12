import { createFileRoute } from '@tanstack/react-router'
import { AuthenticatedLayout } from '@/components/layout/authenticated-layout'
import { requireAdminSession } from '@/features/auth/session'

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: async ({ context, location }) => {
    await requireAdminSession(context.queryClient, location.href)
  },
  component: AuthenticatedLayout,
})
