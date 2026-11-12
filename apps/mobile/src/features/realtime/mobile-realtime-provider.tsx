import type { MobileRealtimeEvent } from '@stepwhere/types';
import { useQueryClient } from '@tanstack/react-query';
import * as Network from 'expo-network';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState } from 'react-native';

import { connectOverviewSocket } from '@/lib/api-client';
import { queryKeys } from '@/query/query-keys';

type RealtimeListener = (event: MobileRealtimeEvent) => void;

type MobileRealtimeContextValue = {
  connectionRevision: number;
  subscribe: (listener: RealtimeListener) => () => void;
};

const MobileRealtimeContext = createContext<MobileRealtimeContextValue | null>(null);

const MAX_RECONNECT_DELAY_MS = 30_000;
const HEARTBEAT_STALE_AFTER_MS = 45_000;
const HEARTBEAT_WATCH_INTERVAL_MS = 10_000;

function getReconnectDelay(attempt: number) {
  const baseDelay = Math.min(1_000 * (2 ** attempt), MAX_RECONNECT_DELAY_MS);
  const jitter = 0.8 + (Math.random() * 0.4);
  return Math.round(baseDelay * jitter);
}

export function MobileRealtimeProvider({
  children,
  organizationId,
}: {
  children: React.ReactNode;
  organizationId: string;
}) {
  const queryClient = useQueryClient();
  const listenersRef = useRef(new Set<RealtimeListener>());
  const [connectionRevision, setConnectionRevision] = useState(0);

  const subscribe = useCallback((listener: RealtimeListener) => {
    listenersRef.current.add(listener);
    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);

  useEffect(() => {
    let disposed = false;
    let generation = 0;
    let connection: ReturnType<typeof connectOverviewSocket> | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectAttempt = 0;
    let isOnline = true;
    let isForeground = AppState.currentState === 'active';
    let socketOpen = false;
    let heartbeatSupported = false;
    let lastTrafficAt = Date.now();

    function clearReconnectTimer() {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    }

    function closeCurrentConnection() {
      socketOpen = false;
      connection?.close();
      connection = null;
    }

    function scheduleReconnect() {
      if (disposed || !isOnline || !isForeground || reconnectTimer) {
        return;
      }

      const delay = getReconnectDelay(reconnectAttempt);
      reconnectAttempt += 1;
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connect();
      }, delay);
    }

    function connect() {
      if (disposed || !isOnline || !isForeground) {
        return;
      }

      clearReconnectTimer();
      closeCurrentConnection();
      const currentGeneration = ++generation;

      connection = connectOverviewSocket({
        onOpen: () => {
          if (disposed || currentGeneration !== generation) {
            return;
          }

          socketOpen = true;
          reconnectAttempt = 0;
          lastTrafficAt = Date.now();
          setConnectionRevision((current) => current + 1);
        },
        onMessage: (event) => {
          if (disposed || currentGeneration !== generation) {
            return;
          }

          lastTrafficAt = Date.now();
          if (event.type === 'realtime.heartbeat') {
            heartbeatSupported = true;
            return;
          }

          if (event.type === 'notifications.changed') {
            void queryClient.invalidateQueries({
              queryKey: queryKeys.unreadNotificationCount(organizationId),
            });
            void queryClient.invalidateQueries({
              queryKey: queryKeys.notifications('inbox'),
            });
          }

          for (const listener of listenersRef.current) {
            try {
              listener(event);
            } catch (error) {
              if (__DEV__) {
                console.warn('[realtime] subscriber failed', error);
              }
            }
          }
        },
        onClose: () => {
          if (disposed || currentGeneration !== generation) {
            return;
          }

          socketOpen = false;
          connection = null;
          scheduleReconnect();
        },
        onError: () => {
          if (disposed || currentGeneration !== generation) {
            return;
          }

          closeCurrentConnection();
          scheduleReconnect();
        },
      });
    }

    function reconnectNow() {
      if (disposed || !isOnline || !isForeground) {
        return;
      }

      generation += 1;
      reconnectAttempt = 0;
      clearReconnectTimer();
      closeCurrentConnection();
      connect();
    }

    const appStateSubscription = AppState.addEventListener('change', (state) => {
      const wasForeground = isForeground;
      isForeground = state === 'active';

      if (!isForeground) {
        generation += 1;
        clearReconnectTimer();
        closeCurrentConnection();
      } else if (!wasForeground) {
        reconnectNow();
      }
    });

    const networkSubscription = Network.addNetworkStateListener((state) => {
      const wasOnline = isOnline;
      isOnline = Boolean(state.isConnected && state.isInternetReachable !== false);

      if (!isOnline) {
        generation += 1;
        clearReconnectTimer();
        closeCurrentConnection();
      } else if (!wasOnline) {
        reconnectNow();
      }
    });

    const heartbeatWatch = setInterval(() => {
      if (
        heartbeatSupported
        && socketOpen
        && Date.now() - lastTrafficAt > HEARTBEAT_STALE_AFTER_MS
      ) {
        reconnectNow();
      }
    }, HEARTBEAT_WATCH_INTERVAL_MS);

    void Network.getNetworkStateAsync().then((state) => {
      if (disposed) {
        return;
      }

      const nextOnline = Boolean(state.isConnected && state.isInternetReachable !== false);
      const wasOnline = isOnline;
      isOnline = nextOnline;

      if (!nextOnline) {
        generation += 1;
        clearReconnectTimer();
        closeCurrentConnection();
      } else if (!wasOnline && isForeground) {
        reconnectNow();
      }
    });

    connect();

    return () => {
      disposed = true;
      generation += 1;
      clearReconnectTimer();
      clearInterval(heartbeatWatch);
      appStateSubscription.remove();
      networkSubscription.remove();
      closeCurrentConnection();
    };
  }, [organizationId, queryClient]);

  const value = useMemo<MobileRealtimeContextValue>(() => ({
    connectionRevision,
    subscribe,
  }), [connectionRevision, subscribe]);

  return (
    <MobileRealtimeContext.Provider value={value}>
      {children}
    </MobileRealtimeContext.Provider>
  );
}

function useMobileRealtimeContext() {
  const value = useContext(MobileRealtimeContext);

  if (!value) {
    throw new Error('MobileRealtimeProvider is required before using realtime state.');
  }

  return value;
}

export function useMobileRealtimeEvent(handler: RealtimeListener) {
  const { subscribe } = useMobileRealtimeContext();
  const handlerRef = useRef(handler);

  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  useEffect(() => subscribe((event) => {
    handlerRef.current(event);
  }), [subscribe]);
}

export function useMobileRealtimeConnectionRevision() {
  return useMobileRealtimeContext().connectionRevision;
}
