import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import React from "react";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

import { AuthPrimaryButton } from "@/features/auth/components/auth-primary-button";
import { useAuth } from "@/features/auth/use-auth";
import {
  clearPendingFamilyInviteToken,
  setPendingFamilyInviteToken,
} from "@/features/family/pending-family-invite";
import { MinimalOnboardingScreen } from "@/features/onboarding/components/minimal-onboarding-screen";

export default function FamilyJoinIngressScreen() {
  const auth = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ token?: string | string[] }>();
  const rawToken = Array.isArray(params.token) ? params.token[0] : params.token;
  const [stored, setStored] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;

    async function persist() {
      if (rawToken) {
        await setPendingFamilyInviteToken(rawToken);
      }

      if (!cancelled) {
        setStored(true);
      }
    }

    void persist();

    return () => {
      cancelled = true;
    };
  }, [rawToken]);

  if (!stored || auth.status === "loading") {
    return (
      <MinimalOnboardingScreen
        progressCurrent={1}
        progressTotal={2}
        subtitle="Saving your family invite securely."
        title="Opening invite"
      >
        <Text style={styles.body}>One moment…</Text>
      </MinimalOnboardingScreen>
    );
  }

  if (!rawToken) {
    return (
      <MinimalOnboardingScreen
        progressCurrent={1}
        progressTotal={1}
        subtitle="This family invite does not contain a valid token."
        title="Invite unavailable"
      >
        <AuthPrimaryButton
          label="Continue"
          onPress={() => router.replace(auth.status === "signedIn" ? auth.nextOnboardingHref : "/auth/sign-in")}
        />
      </MinimalOnboardingScreen>
    );
  }

  if (auth.status === "signedOut") {
    return <Redirect href="/auth/sign-in" />;
  }

  if (auth.user?.family.organization) {
    return (
      <MinimalOnboardingScreen
        progressCurrent={1}
        progressTotal={1}
        subtitle="Your current family membership was not changed."
        title="Already in a family"
      >
        <View style={styles.card}>
          <Text style={styles.cardTitle}>This invite is for another family</Text>
          <Text style={styles.body}>
            Leave your current family first if you intend to join a different one.
          </Text>
          <AuthPrimaryButton
            label="Back to StepWhere"
            onPress={() => {
              void clearPendingFamilyInviteToken();
              router.replace(auth.onboardingCompleted ? "/profile" : auth.nextOnboardingHref);
            }}
          />
        </View>
      </MinimalOnboardingScreen>
    );
  }

  if (auth.nextOnboardingHref !== "/onboarding/family") {
    return <Redirect href={auth.nextOnboardingHref} />;
  }

  return <Redirect href="/onboarding/family" />;
}

const styles = StyleSheet.create((theme) => ({
  card: {
    gap: theme.spacing[4],
    borderRadius: theme.radius.card,
    borderWidth: 1,
    borderColor: theme.colors.chrome.cardBorder,
    backgroundColor: theme.colors.surface,
    padding: theme.spacing[5],
  },
  cardTitle: {
    color: theme.colors.text,
    fontFamily: theme.typography.family.display,
    fontSize: 18,
    fontWeight: theme.typography.weight.bold,
  },
  body: {
    color: theme.colors.textSecondary,
    fontFamily: theme.typography.family.body,
    fontSize: 14,
    lineHeight: 21,
  },
}));
