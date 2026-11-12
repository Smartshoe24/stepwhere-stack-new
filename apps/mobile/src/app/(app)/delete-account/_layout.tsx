import { Redirect, Stack, usePathname } from 'expo-router';
import React from 'react';

import { AppBootstrapScreen } from '@/components/loading/app-bootstrap-screen';
import { useAuth } from '@/features/auth/use-auth';

/**
 * A nested Stack is required for this subdirectory to route at all — the
 * `(app)` layout's Stack does not descend into it.
 *
 * The step guard lives in the screens rather than here: `otp` and `done` read
 * the persisted challenge asynchronously, so a synchronous redirect at this
 * level would bounce a legitimate deep entry before SecureStore resolves.
 */
export default function DeleteAccountLayout() {
  const auth = useAuth();
  const pathname = usePathname();

  if (auth.status === 'loading') {
    return <AppBootstrapScreen />;
  }

  if (auth.status === 'signedOut') {
    // Escape hatch matching the other group layouts, so a sign-out landing on
    // this route cannot ping-pong between guards.
    if (pathname === '/auth/sign-in') {
      return <Stack screenOptions={{ headerShown: false }} />;
    }

    return <Redirect href="/auth/sign-in" />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
