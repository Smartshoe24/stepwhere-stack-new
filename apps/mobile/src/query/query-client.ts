import { focusManager, onlineManager, QueryClient } from '@tanstack/react-query';
import * as Network from 'expo-network';
import { AppState, type AppStateStatus, Platform } from 'react-native';

import { ApiError } from '@/lib/api-client';

function shouldRetry(failureCount: number, error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 401 || error.status === 403 || error.status === 404) {
      return false;
    }
  }

  return failureCount < 1;
}

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 10 * 60_000,
        refetchOnReconnect: true,
        refetchOnWindowFocus: true,
        retry: shouldRetry,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

export function bindQueryLifecycle() {
  const appStateSubscription = AppState.addEventListener('change', (status: AppStateStatus) => {
    if (Platform.OS !== 'web') {
      focusManager.setFocused(status === 'active');
    }
  });

  const networkSubscription = Network.addNetworkStateListener((state) => {
    onlineManager.setOnline(Boolean(state.isConnected && state.isInternetReachable !== false));
  });

  void Network.getNetworkStateAsync().then((state) => {
    onlineManager.setOnline(Boolean(state.isConnected && state.isInternetReachable !== false));
  });

  return () => {
    appStateSubscription.remove();
    networkSubscription.remove();
  };
}
