import type { UserProfileDto } from '@stepwhere/types';
import { useQueryClient } from '@tanstack/react-query';
import type { Href } from 'expo-router';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { ApiError, getMe, setApiUnauthorizedHandler } from '@/lib/api-client';
import { authClient } from '@/lib/auth-client';
import { clearOnboardingDraft, getOnboardingDraft, type OnboardingDraft } from '@/features/onboarding/onboarding-draft';
import { clearParentDetailsDraft } from '@/features/onboarding/parent-details-draft';
import { isMeaningfulParentName } from '@/features/onboarding/parent-profile-readiness';
import { useCurrentProfileQuery } from '@/query/hooks';
import { queryKeys } from '@/query/query-keys';

type AuthStatus = 'loading' | 'signedOut' | 'signedIn';

type AuthContextValue = {
  applyProfilePatch: (patch: Partial<UserProfileDto>) => void;
  nextOnboardingHref: Href;
  onboardingCompleted: boolean;
  refreshSession: () => Promise<void>;
  refreshOnboardingDraft: () => Promise<void>;
  signOut: () => Promise<void>;
  status: AuthStatus;
  user: UserProfileDto | null;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function resolveNextOnboardingHref(user: UserProfileDto | null, draft: OnboardingDraft | null): Href {
  if (!user) {
    return '/auth/sign-in' as const;
  }

  if (user.onboardingCompleted) {
    return '/home' as const;
  }

  const hasIncompleteDetails = !isMeaningfulParentName(user.displayName, user.phoneNumber)
    || !user.currentAddress?.trim()
    || !user.dateOfBirth
    || !user.emailVerified;
  if (hasIncompleteDetails) {
    return '/onboarding/details' as const;
  }

  if (!user.family.organization) {
    return '/onboarding/family' as const;
  }

  const hasValidReservation = draft?.reservation && new Date(draft.reservation.expiresAt) > new Date();
  if (hasValidReservation) {
    return '/onboarding/add-child' as const;
  }

  return '/onboarding/connect-device' as const;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const authSession = authClient.useSession();
  const sessionUserId = authSession.data?.user?.id ?? null;
  const refetchSession = authSession.refetch;
  const [onboardingDraft, setOnboardingDraft] = useState<OnboardingDraft | null>(null);
  const [draftPending, setDraftPending] = useState(true);
  const invalidatingSessionRef = useRef(false);
  const [invalidatingSession, setInvalidatingSession] = useState(false);
  const profileQuery = useCurrentProfileQuery(Boolean(sessionUserId) && !invalidatingSession);
  const profile = sessionUserId && !invalidatingSession
    ? profileQuery.data ?? null
    : null;

  const clearLocalAuthState = useCallback(async () => {
    if (invalidatingSessionRef.current) {
      return;
    }

    invalidatingSessionRef.current = true;
    setInvalidatingSession(true);

    try {
      await authClient.signOut();
      try {
        await clearOnboardingDraft();
        if (sessionUserId) {
          await clearParentDetailsDraft(sessionUserId);
        }
      } catch {
        // ignore draft cleanup failures while invalidating the session
      }
      setOnboardingDraft(null);
      queryClient.clear();
      await refetchSession();
    } finally {
      invalidatingSessionRef.current = false;
      setInvalidatingSession(false);
    }
  }, [queryClient, refetchSession, sessionUserId]);

  useEffect(() => {
    if (profile?.onboardingCompleted && sessionUserId) {
      void clearParentDetailsDraft(sessionUserId);
    }
  }, [profile?.onboardingCompleted, sessionUserId]);

  const reloadProfile = useCallback(async () => {
    return queryClient.fetchQuery({
      queryKey: queryKeys.currentProfile,
      queryFn: ({ signal }) => getMe({ operationName: 'getMe', signal }),
      // Always hit the network. Without this, fetchQuery inherits the 30s default
      // staleTime and a "refresh" right after a mutation is a cache hit, so
      // server-derived fields like onboardingCompleted stay stale and routing
      // guards act on the pre-mutation value.
      staleTime: 0,
    });
  }, [queryClient]);

  const applyProfilePatch = useCallback((patch: Partial<UserProfileDto>) => {
    queryClient.setQueryData<UserProfileDto | null | undefined>(queryKeys.currentProfile, (current) => {
      if (!current) {
        return current;
      }

      return { ...current, ...patch };
    });
  }, [queryClient]);

  useEffect(() => {
    let cancelled = false;

    async function loadDraft() {
      if (!sessionUserId) {
        setOnboardingDraft(null);
        setDraftPending(false);
        return;
      }

      setDraftPending(true);
      try {
        const draft = await getOnboardingDraft();
        if (!cancelled) {
          setOnboardingDraft(draft);
        }
      } catch {
        if (!cancelled) {
          setOnboardingDraft({});
        }
      } finally {
        if (!cancelled) {
          setDraftPending(false);
        }
      }
    }

    void loadDraft();

    return () => {
      cancelled = true;
    };
  }, [sessionUserId]);

  useEffect(() => {
    if (!sessionUserId) {
      return;
    }

    if (!profileQuery.error) {
      return;
    }

    if (profileQuery.error instanceof ApiError && (
      profileQuery.error.status === 401
      || profileQuery.error.status === 404
      || profileQuery.error.code === 'ACCOUNT_DELETION_PENDING'
      || profileQuery.error.code === 'ACCOUNT_DELETION_FINALIZING'
    )) {
      void clearLocalAuthState();
    }
  }, [clearLocalAuthState, profileQuery.data, profileQuery.error, sessionUserId]);

  useEffect(() => {
    setApiUnauthorizedHandler(clearLocalAuthState);

    return () => {
      setApiUnauthorizedHandler(null);
    };
  }, [clearLocalAuthState]);

  const refreshSession = useCallback(async () => {
    await refetchSession();

    try {
      await reloadProfile();
    } catch (error) {
      if (error instanceof ApiError && (
        error.status === 401
        || error.status === 404
        || error.code === 'ACCOUNT_DELETION_PENDING'
        || error.code === 'ACCOUNT_DELETION_FINALIZING'
      )) {
        await clearLocalAuthState();
        return;
      }

      throw error;
    }
  }, [clearLocalAuthState, refetchSession, reloadProfile]);

  const refreshOnboardingDraft = useCallback(async () => {
    try {
      const draft = await getOnboardingDraft();
      setOnboardingDraft(draft);
    } catch {
      setOnboardingDraft({});
    }
  }, []);

  const signOut = useCallback(async () => {
    await clearLocalAuthState();
  }, [clearLocalAuthState]);

  const profilePending = Boolean(sessionUserId) && !profile && profileQuery.isPending;
  const status: AuthStatus = authSession.isPending || profilePending || draftPending || invalidatingSession
    ? 'loading'
    : authSession.data?.user && profile
      ? 'signedIn'
      : 'signedOut';

  const value = useMemo<AuthContextValue>(() => ({
    applyProfilePatch,
    status,
    user: profile,
    onboardingCompleted: profile?.onboardingCompleted ?? false,
    nextOnboardingHref: resolveNextOnboardingHref(profile, onboardingDraft),
    refreshSession,
    refreshOnboardingDraft,
    signOut,
  }), [
    applyProfilePatch,
    onboardingDraft,
    profile,
    refreshOnboardingDraft,
    refreshSession,
    signOut,
    status,
  ]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuthContext() {
  const value = useContext(AuthContext);

  if (!value) {
    throw new Error('AuthProvider is required before using auth state.');
  }

  return value;
}
