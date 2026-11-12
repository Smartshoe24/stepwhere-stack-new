import { Redirect, Stack, usePathname } from "expo-router";
import React from "react";

import { AppBootstrapScreen } from "@/components/loading/app-bootstrap-screen";
import { useAuth } from "@/features/auth/use-auth";
import { MobileRealtimeProvider } from "@/features/realtime/mobile-realtime-provider";

export default function AppLayout() {
  const auth = useAuth();
  const pathname = usePathname();
  // return <AppBootstrapScreen />;

  if (auth.status === "loading") {
    return <AppBootstrapScreen />;
  }

  if (auth.status === "signedOut") {
    if (pathname === "/auth/sign-in") {
      return <Stack screenOptions={{ headerShown: false }} />;
    }

    return <Redirect href="/auth/sign-in" />;
  }

  if (!auth.onboardingCompleted) {
    if (auth.nextOnboardingHref === pathname) {
      return <Stack screenOptions={{ headerShown: false }} />;
    }

    return <Redirect href={auth.nextOnboardingHref} />;
  }

  const organizationId = auth.user?.family.organization?.id;

  if (!organizationId) {
    return <Redirect href="/onboarding/family" />;
  }

  return (
    <MobileRealtimeProvider organizationId={organizationId}>
      <Stack screenOptions={{ headerShown: false }} />
    </MobileRealtimeProvider>
  );
}
