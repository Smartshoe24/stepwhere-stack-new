import { queryOptions, type QueryClient, useQuery } from '@tanstack/react-query'
import { redirect } from '@tanstack/react-router'

import { logAuthDebug } from '@/features/auth/auth-debug'
import { stepwhereApiBaseUrl, getSession, signOut } from '@/lib/api-client'
import { getAuthOriginDiagnostics } from '@/lib/auth-origin'

export const sessionQueryKey = ['auth', 'session'] as const

export function sessionQueryOptions() {
  return queryOptions({
    queryKey: sessionQueryKey,
    queryFn: getSession,
    staleTime: 60 * 1000,
  })
}

export function useSessionQuery() {
  return useQuery(sessionQueryOptions())
}

export function clearSessionQuery(queryClient: QueryClient) {
  queryClient.removeQueries({ queryKey: sessionQueryKey })
}

export async function requireAdminSession(
  queryClient: QueryClient,
  redirectTo?: string
) {
  const session = await queryClient.ensureQueryData(sessionQueryOptions())
  const authOrigin =
    typeof window === 'undefined'
      ? null
      : getAuthOriginDiagnostics(stepwhereApiBaseUrl, window.location.origin)

  logAuthDebug('require admin session', {
    apiBaseUrl: stepwhereApiBaseUrl,
    authOrigin,
    hasUser: Boolean(session.user),
    userId: session.user?.id ?? null,
    phoneNumber: session.user?.phoneNumber ?? null,
    role: session.user?.role ?? null,
  })

  if (!session.user) {
    logAuthDebug('require admin session redirect', {
      reason: 'guard-missing-user',
      apiBaseUrl: stepwhereApiBaseUrl,
      authOrigin,
      redirectTo: redirectTo ?? null,
    })

    throw redirect({
      to: '/sign-in',
      search: redirectTo ? { redirect: redirectTo } : undefined,
    })
  }

  if (session.user.role !== 'admin') {
    logAuthDebug('require admin session redirect', {
      reason: 'guard-non-admin',
      apiBaseUrl: stepwhereApiBaseUrl,
      authOrigin,
      userId: session.user.id,
      phoneNumber: session.user.phoneNumber,
      role: session.user.role,
    })

    try {
      await signOut({ suppressUnauthorized: true })
    } catch {
      // Ignore sign-out failures while clearing a rejected admin session.
    }

    clearSessionQuery(queryClient)
    throw redirect({ to: '/403' })
  }

  return session
}

export async function redirectAuthenticatedAdmin(queryClient: QueryClient) {
  const session = await queryClient.ensureQueryData(sessionQueryOptions())
  const authOrigin =
    typeof window === 'undefined'
      ? null
      : getAuthOriginDiagnostics(stepwhereApiBaseUrl, window.location.origin)

  logAuthDebug('redirect authenticated admin', {
    apiBaseUrl: stepwhereApiBaseUrl,
    authOrigin,
    hasUser: Boolean(session.user),
    userId: session.user?.id ?? null,
    phoneNumber: session.user?.phoneNumber ?? null,
    role: session.user?.role ?? null,
  })

  if (session.user?.role === 'admin') {
    throw redirect({ to: '/' })
  }

  return session
}
