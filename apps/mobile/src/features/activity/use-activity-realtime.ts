import type { ChildActivityResponseDto } from '@stepwhere/types';
import { useQueryClient } from '@tanstack/react-query';
import React from 'react';

import {
  useMobileRealtimeConnectionRevision,
  useMobileRealtimeEvent,
} from '@/features/realtime/mobile-realtime-provider';
import { queryKeys } from '@/query/query-keys';

import { applySteppedEvent } from './activity-live-patch';

/**
 * Keeps today's activity numbers moving from the app-wide authenticated socket.
 * Reconnects reconcile the authoritative aggregate in case an event was missed.
 */
export function useActivityRealtime(input: {
  childId: string | null;
  enabled: boolean;
  endDate: string;
  isLive: boolean;
  period: ChildActivityResponseDto['period'];
  startDate: string;
  timezone: string;
}) {
  const queryClient = useQueryClient();
  const connectionRevision = useMobileRealtimeConnectionRevision();
  const previousConnectionRevisionRef = React.useRef(connectionRevision);
  const { childId, enabled, endDate, isLive, period, startDate, timezone } = input;
  const queryKey = childId
    ? queryKeys.childActivity(childId, period, startDate, endDate, timezone)
    : null;

  useMobileRealtimeEvent((event) => {
    if (
      !queryKey
      || !enabled
      || !isLive
      || event.type !== 'activity.stepped'
      || event.data.childId !== childId
    ) {
      return;
    }

    queryClient.setQueryData<ChildActivityResponseDto>(queryKey, (current) => (
      current ? applySteppedEvent(current, event.data) : current
    ));
  });

  React.useEffect(() => {
    const previousRevision = previousConnectionRevisionRef.current;
    previousConnectionRevisionRef.current = connectionRevision;

    if (
      connectionRevision === previousRevision
      || !queryKey
      || !enabled
      || !isLive
    ) {
      return;
    }

    void queryClient.invalidateQueries({ queryKey });
  }, [connectionRevision, enabled, isLive, queryClient, queryKey]);
}
