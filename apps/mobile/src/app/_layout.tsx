import { Stack, ThemeProvider } from 'expo-router';
import * as SystemUI from 'expo-system-ui';
import React from 'react';
import { Linking } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useUnistyles } from 'react-native-unistyles';

import { AppQueryProvider } from '@/query/query-provider';
import { ThemeTransitionProvider } from '@/components/theme/theme-transition-provider';
import { AuthProvider } from '@/features/auth/auth-provider';
import { NotificationProvider } from '@/features/notifications/notification-provider';
import { capturePendingFamilyInviteUrl } from '@/features/family/pending-family-invite';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeTransitionProvider>
        <AppQueryProvider>
          <AuthProvider>
            <PendingFamilyInviteCoordinator />
            <NotificationProvider>
              <RootNavigator />
            </NotificationProvider>
          </AuthProvider>
        </AppQueryProvider>
      </ThemeTransitionProvider>
    </GestureHandlerRootView>
  );
}

function PendingFamilyInviteCoordinator() {
  React.useEffect(() => {
    void Linking.getInitialURL().then((url) => {
      if (url) {
        void capturePendingFamilyInviteUrl(url);
      }
    });

    const subscription = Linking.addEventListener('url', ({ url }) => {
      void capturePendingFamilyInviteUrl(url);
    });

    return () => subscription.remove();
  }, []);

  return null;
}

function RootNavigator() {
  const { rt, theme } = useUnistyles();

  React.useEffect(() => {
    void SystemUI.setBackgroundColorAsync(theme.colors.background);
  }, [theme.colors.background]);

  const navigationTheme = React.useMemo(() => ({
    dark: rt.themeName === 'dark',
    colors: {
      primary: theme.colors.navActive,
      background: theme.colors.background,
      card: theme.colors.surface,
      text: theme.colors.text,
      border: theme.colors.chrome.cardBorder,
      notification: theme.colors.alertText,
    },
    fonts: {
      regular: {
        fontFamily: theme.typography.family.body,
        fontWeight: theme.typography.weight.regular,
      },
      medium: {
        fontFamily: theme.typography.family.body,
        fontWeight: theme.typography.weight.medium,
      },
      bold: {
        fontFamily: theme.typography.family.display,
        fontWeight: theme.typography.weight.bold,
      },
      heavy: {
        fontFamily: theme.typography.family.display,
        fontWeight: theme.typography.weight.bold,
      },
    },
  }), [rt.themeName, theme]);

  return (
    <ThemeProvider value={navigationTheme}>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: {
            backgroundColor: theme.colors.background,
          },
        }}
      />
    </ThemeProvider>
  );
}
