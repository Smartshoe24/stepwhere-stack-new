import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import React from 'react';
import { AppState, Linking, Platform } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';

import { useAuth } from '@/features/auth/use-auth';
import { billingRoutes } from '@/features/billing/billing-routes';
import { deletePushInstallation, getBillingOverview, registerCurrentPushInstallation } from '@/lib/api-client';
import { queryKeys } from '@/query/query-keys';
import {
  getOrCreatePushInstallationId,
  hasShownNotificationPermissionPrompt,
  markNotificationPermissionPromptShown,
} from './notification-installation';
import { NotificationPermissionSheet } from './notification-permission-sheet';
import {
  ensureNotificationChannels,
  getNotificationPermissionState,
  notificationPermissionAllowsPush,
  registerForExpoPushToken,
  requestNotificationPermission as requestSystemNotificationPermission,
  type NotificationPermissionState,
} from './notification-registration';
import { getChildIdFromNotificationResponse, isBillingNotificationResponse } from './notification-routing';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

type NotificationContextValue = {
  enableNotifications: () => Promise<void>;
  openSystemNotificationSettings: () => Promise<void>;
  permissionState: NotificationPermissionState;
  registrationError: string | null;
  registrationState: 'idle' | 'registering' | 'registered' | 'error';
  retryRegistration: () => Promise<void>;
};

const NotificationContext = React.createContext<NotificationContextValue | null>(null);

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  const signedInUserId = auth.user?.id ?? null;
  const router = useRouter();
  const queryClient = useQueryClient();
  const organizationId = auth.user?.family.organization?.id ?? null;
  const [permissionState, setPermissionState] = React.useState<NotificationPermissionState>('undetermined');
  const [registrationState, setRegistrationState] = React.useState<'idle' | 'registering' | 'registered' | 'error'>('idle');
  const [registrationError, setRegistrationError] = React.useState<string | null>(null);
  const [showPermissionSheet, setShowPermissionSheet] = React.useState(false);
  const installationIdRef = React.useRef<string | null>(null);
  const registrationPromiseRef = React.useRef<Promise<void> | null>(null);

  const navigateFromNotification = React.useCallback((childId: string | null) => {
    if (!childId) {
      router.navigate('/home');
      return;
    }

    router.navigate({
      pathname: '/home',
      params: {
        childId,
      },
    });
  }, [router]);

  // Billing pushes open Subscription, or Choose a plan when there's no live plan.
  const navigateToBilling = React.useCallback(async () => {
    try {
      const overview = await queryClient.fetchQuery({
        queryKey: queryKeys.billingOverview(organizationId),
        queryFn: ({ signal }) => getBillingOverview({ operationName: 'getBillingOverview', signal }),
        staleTime: 0,
      });
      const subscription = overview.subscription;
      const hasLivePlan = Boolean(subscription && subscription.state !== 'expired' && subscription.state !== 'revoked');

      router.navigate(hasLivePlan || !overview.purchasesEnabled ? billingRoutes.subscription() : billingRoutes.choosePlan());
    } catch {
      router.navigate(billingRoutes.subscription());
    }
  }, [organizationId, queryClient, router]);

  const handleNotificationResponse = React.useCallback((response: Notifications.NotificationResponse) => {
    if (isBillingNotificationResponse(response)) {
      void navigateToBilling();
      return;
    }

    navigateFromNotification(getChildIdFromNotificationResponse(response));
  }, [navigateFromNotification, navigateToBilling]);

  const performPushRegistration = React.useCallback(async () => {
    if (auth.status !== 'signedIn' || !auth.onboardingCompleted || !signedInUserId) {
      setRegistrationState('idle');
      setRegistrationError(null);
      return;
    }

    setRegistrationState('registering');
    setRegistrationError(null);

    try {
      await ensureNotificationChannels();
      const nextPermissionState = await getNotificationPermissionState();
      setPermissionState(nextPermissionState);

      if (!notificationPermissionAllowsPush(nextPermissionState)) {
        setRegistrationState('idle');
        const hasPrompted = await hasShownNotificationPermissionPrompt();
        if (!hasPrompted) {
          setShowPermissionSheet(true);
        }
        return;
      }

      const expoPushToken = await registerForExpoPushToken();
      if (!expoPushToken) {
        throw new Error('Push notifications require a physical device.');
      }

      const installationId = await getOrCreatePushInstallationId();
      installationIdRef.current = installationId;

      await registerCurrentPushInstallation({
        expoPushToken,
        installationId,
        platform: Platform.OS === 'ios' ? 'ios' : 'android',
        appVersion: Constants.expoConfig?.version ?? null,
      });

      setRegistrationState('registered');
    } catch (error) {
      const message = error instanceof Error && error.message.includes('physical device')
        ? error.message
        : 'Notifications could not be set up. Check your connection and try again.';
      setRegistrationState('error');
      setRegistrationError(message);
      console.warn('[notifications] push registration failed', {
        message: error instanceof Error ? error.message : String(error),
        platform: Platform.OS,
      });
    }
  }, [auth.onboardingCompleted, auth.status, signedInUserId]);

  const syncPushRegistration = React.useCallback(() => {
    if (registrationPromiseRef.current) {
      return registrationPromiseRef.current;
    }

    const registrationPromise = performPushRegistration().finally(() => {
      if (registrationPromiseRef.current === registrationPromise) {
        registrationPromiseRef.current = null;
      }
    });
    registrationPromiseRef.current = registrationPromise;
    return registrationPromise;
  }, [performPushRegistration]);

  React.useEffect(() => {
    const timeout = setTimeout(() => {
      void syncPushRegistration();
    }, 0);

    return () => {
      clearTimeout(timeout);
    };
  }, [syncPushRegistration]);

  React.useEffect(() => {
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void syncPushRegistration();
      }
    });
    const tokenSubscription = Notifications.addPushTokenListener(() => {
      void syncPushRegistration();
    });

    return () => {
      appStateSubscription.remove();
      tokenSubscription.remove();
    };
  }, [syncPushRegistration]);

  React.useEffect(() => {
    const responseSubscription = Notifications.addNotificationResponseReceivedListener(handleNotificationResponse);

    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!response) {
        return;
      }

      handleNotificationResponse(response);
    });

    return () => {
      responseSubscription.remove();
    };
  }, [handleNotificationResponse]);

  React.useEffect(() => {
    if (auth.status !== 'signedOut' || !installationIdRef.current) {
      return;
    }

    void deletePushInstallation(installationIdRef.current).catch(() => undefined);
    installationIdRef.current = null;
    setRegistrationState('idle');
    setRegistrationError(null);
  }, [auth.status]);

  const handleEnableNotifications = React.useCallback(async () => {
    setShowPermissionSheet(false);
    await markNotificationPermissionPromptShown();
    try {
      const nextPermissionState = await requestSystemNotificationPermission();
      setPermissionState(nextPermissionState);

      if (notificationPermissionAllowsPush(nextPermissionState)) {
        await syncPushRegistration();
      }
    } catch (error) {
      setRegistrationState('error');
      setRegistrationError('Notifications could not be enabled. Please try again.');
      console.warn('[notifications] permission request failed', {
        message: error instanceof Error ? error.message : String(error),
        platform: Platform.OS,
      });
    }
  }, [syncPushRegistration]);

  const value = React.useMemo<NotificationContextValue>(() => ({
    enableNotifications: handleEnableNotifications,
    permissionState,
    registrationError,
    registrationState,
    retryRegistration: syncPushRegistration,
    openSystemNotificationSettings: async () => {
      await Linking.openSettings();
    },
  }), [handleEnableNotifications, permissionState, registrationError, registrationState, syncPushRegistration]);

  return (
    <NotificationContext.Provider value={value}>
      {children}
      <NotificationPermissionSheet
        onClose={async () => {
          setShowPermissionSheet(false);
          await markNotificationPermissionPromptShown();
          setPermissionState(await getNotificationPermissionState());
        }}
        onEnable={() => {
          void handleEnableNotifications();
        }}
        visible={showPermissionSheet}
      />
    </NotificationContext.Provider>
  );
}

export function useNotificationPermission() {
  const value = React.useContext(NotificationContext);

  if (!value) {
    throw new Error('NotificationProvider is required before using notification state.');
  }

  return value;
}
