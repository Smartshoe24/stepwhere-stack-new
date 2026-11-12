import { Redirect, Stack, usePathname } from 'expo-router';
import React from 'react';

import { AppBootstrapScreen } from '@/components/loading/app-bootstrap-screen';
import { useAuth } from '@/features/auth/use-auth';

export default function AuthLayout() {
  const auth = useAuth();
  const pathname = usePathname();

  if (auth.status === 'loading') {
    return <AppBootstrapScreen />;
  }

  if (auth.status === 'signedIn') {
    const targetHref = auth.onboardingCompleted ? '/home' : auth.nextOnboardingHref;

    if (targetHref === pathname) {
      return <Stack screenOptions={{ headerShown: false }} />;
    }

    return <Redirect href={targetHref} />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
