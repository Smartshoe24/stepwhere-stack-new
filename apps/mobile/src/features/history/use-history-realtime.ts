import { useQueryClient } from '@tanstack/react-query';
import { useFocusEffect } from 'expo-router';
import React from 'react';

import {
  useMobileRealtimeConnectionRevision,
  useMobileRealtimeEvent,
} from '@/features/realtime/mobile-realtime-provider';
import { queryKeys } from '@/query/query-keys';

const UPDATE_DEBOUNCE_MS = 750;

/**
 * Reconciles History on focus and after committed materialization events from the
 * app-wide socket. A reconnect also repairs any event missed while disconnected.
 */
export function useHistoryRealtime(input: {
  childId: string | null;
  enabled: boolean;
  isLive: boolean;
  timezone: string;
}) {
  const queryClient = useQueryClient();
  const connectionRevision = useMobileRealtimeConnectionRevision();
  const previousConnectionRevisionRef = React.useRef(connectionRevision);
  const focusedRef = React.useRef(false);
  const updateTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const { childId, enabled, isLive, timezone } = input;

  const clearPendingUpdate = React.useCallback(() => {
    if (updateTimeoutRef.current) {
      clearTimeout(updateTimeoutRef.current);
      updateTimeoutRef.current = null;
    }
  }, []);

  const refreshHistory = React.useCallback(() => {
    if (!childId || !enabled) {
      return Promise.resolve();
    }

    return queryClient.invalidateQueries({
      queryKey: queryKeys.childHistory(childId, timezone),
    });
  }, [childId, enabled, queryClient, timezone]);

  useFocusEffect(
    React.useCallback(() => {
      focusedRef.current = true;
      void refreshHistory();

      return () => {
        focusedRef.current = false;
        clearPendingUpdate();
      };
    }, [clearPendingUpdate, refreshHistory]),
  );

  useMobileRealtimeEvent((event) => {
    if (
      !focusedRef.current
      || !childId
      || !enabled
      || !isLive
      || event.type !== 'history.updated'
      || event.data.childId !== childId
    ) {
      return;
    }

    clearPendingUpdate();
    updateTimeoutRef.current = setTimeout(() => {
      updateTimeoutRef.current = null;
      if (focusedRef.current) {
        void refreshHistory();
      }
    }, UPDATE_DEBOUNCE_MS);
  });

  React.useEffect(() => {
    const previousRevision = previousConnectionRevisionRef.current;
    previousConnectionRevisionRef.current = connectionRevision;

    if (
      connectionRevision !== previousRevision
      && focusedRef.current
      && enabled
      && isLive
    ) {
      void refreshHistory();
    }
  }, [connectionRevision, enabled, isLive, refreshHistory]);

  React.useEffect(() => clearPendingUpdate, [clearPendingUpdate]);
}
