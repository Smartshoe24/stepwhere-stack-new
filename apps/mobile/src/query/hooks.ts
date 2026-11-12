import {
  type QueryClient,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import type {
  ActivityPeriod,
  ChildTrailGeometryRequestMode,
  BindChildDeviceInput,
  UpdateChildInput,
  UpdateMeInput,
} from '@stepwhere/types';

import {
  archiveChild,
  bindChildDevice,
  createFamilyQrInvite,
  getChildActivity,
  getChildHistoryDay,
  getChildHistoryRange,
  getChild,
  getActiveChildShareLink,
  getChildTrail,
  getFamilyMembers,
  getMe,
  getNotifications,
  getOverview,
  leaveFamily,
  getUnreadNotificationCount,
  markAllNotificationsRead,
  markNotificationRead,
  removeFamilyMember,
  unlinkChildDevice,
  updateChild,
  updateMe,
} from '@/lib/api-client';
import { queryKeys } from '@/query/query-keys';

export function useCurrentProfileQuery(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.currentProfile,
    queryFn: ({ signal }) => getMe({ operationName: 'getMe', signal }),
    enabled,
  });
}

export function useOverviewQuery(organizationId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.overview(organizationId),
    queryFn: ({ signal }) => getOverview({ operationName: 'getOverview', signal }),
    enabled: Boolean(organizationId),
  });
}

export function useChildDetailQuery(childId: string | null, enabled = true) {
  return useQuery({
    queryKey: childId ? queryKeys.childDetail(childId) : ['child-detail', 'disabled'] as const,
    queryFn: ({ signal }) => {
      if (!childId) {
        throw new Error('Child detail requested without a child id.');
      }

      return getChild(childId, { operationName: 'getChild', signal });
    },
    enabled: Boolean(childId) && enabled,
  });
}

export function useActiveChildShareQuery(childId: string | null, enabled = true) {
  return useQuery({
    queryKey: childId
      ? queryKeys.activeChildShare(childId)
      : ['active-child-share', 'disabled'] as const,
    queryFn: ({ signal }) => {
      if (!childId) {
        throw new Error('Active share requested without a child id.');
      }

      return getActiveChildShareLink(childId, {
        operationName: 'getActiveChildShareLink',
        signal,
      });
    },
    enabled: Boolean(childId) && enabled,
    staleTime: 15_000,
    refetchOnMount: 'always',
  });
}

export function useFamilyMembersQuery(organizationId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.familyMembers(organizationId),
    queryFn: ({ signal }) => getFamilyMembers({ operationName: 'getFamilyMembers', signal }),
    enabled: Boolean(organizationId),
  });
}

export async function prefetchFamilyMembers(queryClient: QueryClient, organizationId: string) {
  await queryClient.prefetchQuery({
    queryKey: queryKeys.familyMembers(organizationId),
    queryFn: ({ signal }) => getFamilyMembers({ operationName: 'prefetchFamilyMembers', signal }),
    staleTime: 30_000,
  });
}

export function useUnreadNotificationCountQuery(organizationId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.unreadNotificationCount(organizationId),
    queryFn: ({ signal }) => getUnreadNotificationCount({ operationName: 'getUnreadNotificationCount', signal }),
    enabled: Boolean(organizationId),
  });
}

export function useNotificationsInfiniteQuery(enabled: boolean) {
  return useInfiniteQuery({
    queryKey: queryKeys.notifications('inbox'),
    queryFn: ({ pageParam, signal }) => getNotifications({
      cursor: typeof pageParam === 'string' ? pageParam : null,
      limit: 20,
    }, {
      operationName: 'getNotifications',
      signal,
    }),
    enabled,
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? null,
  });
}

export function useChildTrailQuery(input: {
  childId: string | null;
  distanceMeters: number;
  enabled?: boolean;
  geometry?: ChildTrailGeometryRequestMode;
}) {
  return useQuery({
    queryKey: input.childId
      ? queryKeys.childTrail(input.childId, input.distanceMeters, input.geometry ?? 'roads')
      : ['child-trail', 'disabled'] as const,
    queryFn: ({ signal }) => {
      if (!input.childId) {
        throw new Error('Child trail requested without a child id.');
      }

      return getChildTrail(input.childId, {
        distanceMeters: input.distanceMeters,
        geometry: input.geometry,
      }, {
        operationName: 'getChildTrail',
        signal,
      });
    },
    enabled: Boolean(input.childId) && (input.enabled ?? true),
  });
}

export function useChildActivityQuery(input: {
  childId: string | null;
  endDate: string;
  enabled?: boolean;
  period: ActivityPeriod;
  startDate: string;
  timezone: string;
}) {
  return useQuery({
    queryKey: input.childId
      ? queryKeys.childActivity(
        input.childId,
        input.period,
        input.startDate,
        input.endDate,
        input.timezone,
      )
      : ['child-activity', 'disabled'] as const,
    queryFn: ({ signal }) => {
      if (!input.childId) {
        throw new Error('Activity requested without a child id.');
      }

      return getChildActivity({
        childId: input.childId,
        endDate: input.endDate,
        period: input.period,
        startDate: input.startDate,
        timezone: input.timezone,
      }, {
        operationName: 'getChildActivity',
        signal,
      });
    },
    enabled: Boolean(input.childId) && (input.enabled ?? true),
  });
}

export function useChildHistoryRangeQuery(input: {
  childId: string | null;
  enabled?: boolean;
  timezone: string;
}) {
  return useQuery({
    queryKey: input.childId
      ? queryKeys.childHistoryRange(input.childId, input.timezone)
      : ['child-history-range', 'disabled'] as const,
    queryFn: ({ signal }) => {
      if (!input.childId) {
        throw new Error('History range requested without a child id.');
      }

      return getChildHistoryRange({
        childId: input.childId,
        timezone: input.timezone,
      }, {
        operationName: 'getChildHistoryRange',
        signal,
      });
    },
    enabled: Boolean(input.childId) && (input.enabled ?? true),
    refetchOnMount: 'always',
  });
}

export function useChildHistoryDayQuery(input: {
  childId: string | null;
  date: string;
  enabled?: boolean;
  timezone: string;
}) {
  return useQuery({
    queryKey: input.childId
      ? queryKeys.childHistoryDay(input.childId, input.date, input.timezone)
      : ['child-history-day', 'disabled'] as const,
    queryFn: ({ signal }) => {
      if (!input.childId) {
        throw new Error('History day requested without a child id.');
      }

      return getChildHistoryDay({
        childId: input.childId,
        date: input.date,
        timezone: input.timezone,
      }, {
        operationName: 'getChildHistoryDay',
        signal,
      });
    },
    enabled: Boolean(input.childId) && (input.enabled ?? true),
    refetchOnMount: 'always',
  });
}

export function useUpdateProfileMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateMeInput) => updateMe(input, { operationName: 'updateMe' }),
    onSuccess: (profile) => {
      queryClient.setQueryData(queryKeys.currentProfile, profile);
    },
  });
}

export function useUpdateChildMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ childId, input }: { childId: string; input: UpdateChildInput }) => updateChild(childId, input, {
      operationName: 'updateChild',
    }),
    onSuccess: (child) => {
      queryClient.setQueryData(queryKeys.childDetail(child.id), child);
      void queryClient.invalidateQueries({ queryKey: ['overview'] });
    },
  });
}

export function useArchiveChildMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ childId }: { childId: string }) => archiveChild(childId, {
      operationName: 'archiveChild',
    }),
    onSuccess: (_result, variables) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.childDetail(variables.childId) });
      void queryClient.invalidateQueries({ queryKey: ['overview'] });
    },
  });
}

export function useUnlinkChildDeviceMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ childId }: { childId: string }) => unlinkChildDevice(childId, {
      operationName: 'unlinkChildDevice',
    }),
    onSuccess: (_result, variables) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.childDetail(variables.childId) });
      void queryClient.invalidateQueries({ queryKey: ['overview'] });
    },
  });
}

export function useBindChildDeviceMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ childId, input }: { childId: string; input: BindChildDeviceInput }) => bindChildDevice(childId, input, {
      operationName: 'bindChildDevice',
    }),
    onSuccess: (_result, variables) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.childDetail(variables.childId) });
      void queryClient.invalidateQueries({ queryKey: ['overview'] });
    },
  });
}

export function useCreateFamilyQrInviteMutation() {
  return useMutation({
    mutationFn: () => createFamilyQrInvite({ operationName: 'createFamilyQrInvite' }),
  });
}

export function useRemoveFamilyMemberMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ memberId }: { memberId: string }) => removeFamilyMember(memberId, {
      operationName: 'removeFamilyMember',
    }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['family-members'] });
    },
  });
}

export function useLeaveFamilyMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => leaveFamily({ operationName: 'leaveFamily' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.currentProfile });
      void queryClient.invalidateQueries({ queryKey: ['family-members'] });
      void queryClient.invalidateQueries({ queryKey: ['overview'] });
      void queryClient.invalidateQueries({ queryKey: ['notification-unread-count'] });
    },
  });
}

export function useMarkNotificationReadMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (notificationId: string) => markNotificationRead(notificationId, {
      operationName: 'markNotificationRead',
    }),
    onMutate: async (notificationId) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.notifications('inbox') });
      const previous = queryClient.getQueryData(queryKeys.notifications('inbox'));

      queryClient.setQueriesData({ queryKey: queryKeys.notifications('inbox') }, (current: any) => {
        if (!current?.pages) {
          return current;
        }

        return {
          ...current,
          pages: current.pages.map((page: any) => ({
            ...page,
            items: page.items.map((item: any) => (
              item.id === notificationId
                ? { ...item, readAt: item.readAt ?? new Date().toISOString() }
                : item
            )),
          })),
        };
      });

      return { previous };
    },
    onError: (_error, _notificationId, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.notifications('inbox'), context.previous);
      }
    },
  });
}

export function useMarkAllNotificationsReadMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => markAllNotificationsRead({ operationName: 'markAllNotificationsRead' }),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: queryKeys.notifications('inbox') });
      const previousNotifications = queryClient.getQueryData(queryKeys.notifications('inbox'));
      const previousUnread = queryClient.getQueriesData({ queryKey: ['notification-unread-count'] });

      queryClient.setQueriesData({ queryKey: queryKeys.notifications('inbox') }, (current: any) => {
        if (!current?.pages) {
          return current;
        }

        return {
          ...current,
          pages: current.pages.map((page: any) => ({
            ...page,
            items: page.items.map((item: any) => ({
              ...item,
              readAt: item.readAt ?? new Date().toISOString(),
            })),
          })),
        };
      });
      queryClient.setQueriesData({ queryKey: ['notification-unread-count'] }, (current: any) => (
        current ? { ...current, unreadCount: 0 } : current
      ));

      return {
        previousNotifications,
        previousUnread,
      };
    },
    onError: (_error, _variables, context) => {
      if (context?.previousNotifications) {
        queryClient.setQueryData(queryKeys.notifications('inbox'), context.previousNotifications);
      }

      if (context?.previousUnread) {
        for (const [key, value] of context.previousUnread) {
          queryClient.setQueryData(key, value);
        }
      }
    },
  });
}
