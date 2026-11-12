import { Redirect, Stack, usePathname } from 'expo-router';
import React from 'react';

import { AppBootstrapScreen } from '@/components/loading/app-bootstrap-screen';
import { useAuth } from '@/features/auth/use-auth';

export default function OnboardingLayout() {
  const auth = useAuth();
  const pathname = usePathname();

  if (auth.status === 'loading') {
    return <AppBootstrapScreen />;
  }

  if (auth.status === 'signedOut') {
    if (pathname === '/auth/sign-in') {
      return <Stack screenOptions={{ headerShown: false }} />;
    }

    return <Redirect href="/auth/sign-in" />;
  }

  if (auth.onboardingCompleted) {
    if (pathname === '/home') {
      return <Stack screenOptions={{ headerShown: false }} />;
    }

    return <Redirect href="/home" />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
