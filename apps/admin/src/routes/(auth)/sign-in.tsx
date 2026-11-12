import { z } from 'zod'
import type { QueryClient } from '@tanstack/react-query'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { redirectAuthenticatedAdmin } from '@/features/auth/session'
import { SignIn } from '@/features/auth/sign-in'
import { getAdminSetupStatus } from '@/lib/api-client'

const searchSchema = z.object({
  redirect: z.string().optional(),
})

export const Route = createFileRoute('/(auth)/sign-in')({
  beforeLoad: async ({ context }) => {
    await signInBeforeLoad({ context })
  },
  component: SignIn,
  validateSearch: searchSchema,
})

async function isAdminSetupRequired() {
  try {
    return (await getAdminSetupStatus()).required
  } catch {
    // The setup check must never block the normal login.
    return false
  }
}

export async function signInBeforeLoad({
  context,
}: {
  context: { queryClient: QueryClient }
}) {
  if (await isAdminSetupRequired()) {
    throw redirect({ to: '/setup', replace: true })
  }

  await redirectAuthenticatedAdmin(context.queryClient)
}
