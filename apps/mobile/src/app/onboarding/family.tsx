import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import type { JoinFamilyPreviewDto } from '@stepwhere/types';

import { AuthPrimaryButton } from '@/features/auth/components/auth-primary-button';
import { useAuth } from '@/features/auth/use-auth';
import {
  clearPendingFamilyInviteToken,
  getPendingFamilyInviteToken,
} from '@/features/family/pending-family-invite';
import { FamilyPathCard } from '@/features/onboarding/components/family-path-card';
import { MinimalOnboardingScreen } from '@/features/onboarding/components/minimal-onboarding-screen';
import {
  ApiError,
  joinFamily,
  previewJoinFamilyToken,
  startFamily,
} from '@/lib/api-client';

export default function FamilyScreen() {
  const router = useRouter();
  const auth = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pendingToken, setPendingToken] = useState<string | null>(null);
  const [pendingPreview, setPendingPreview] = useState<JoinFamilyPreviewDto | null>(null);
  const [pendingState, setPendingState] = useState<'loading' | 'preview' | 'terminal' | 'none'>('loading');
  const [now, setNow] = useState(() => Date.now());

  React.useEffect(() => {
    let cancelled = false;

    async function loadPendingInvite() {
      const token = await getPendingFamilyInviteToken();

      if (!token) {
        if (!cancelled) {
          setPendingState('none');
        }
        return;
      }

      if (!cancelled) {
        setPendingToken(token);
      }

      try {
        const preview = await previewJoinFamilyToken(token, {
          operationName: 'previewPendingFamilyInvite',
        });

        if (cancelled) {
          return;
        }

        if (!preview.isValid || new Date(preview.expiresAt).getTime() <= Date.now()) {
          await clearPendingFamilyInviteToken();
          setSubmitError('This family invite expired. Ask the family admin for a new invite.');
          setPendingState('terminal');
          return;
        }

        setPendingPreview(preview);
        setNow(Date.now());
        setPendingState('preview');
      } catch (error) {
        if (cancelled) {
          return;
        }

        if (error instanceof ApiError && error.code === 'ALREADY_IN_FAMILY') {
          setSubmitError('You are already in a family. Your membership was not changed.');
        } else {
          await clearPendingFamilyInviteToken();
          setSubmitError(
            error instanceof Error
              ? error.message
              : 'This family invite is unavailable.',
          );
        }
        setPendingState('terminal');
      }
    }

    void loadPendingInvite();

    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    if (pendingState !== 'preview' || !pendingPreview) {
      return;
    }

    const timer = setInterval(() => {
      const nextNow = Date.now();
      setNow(nextNow);

      if (new Date(pendingPreview.expiresAt).getTime() <= nextNow) {
        void clearPendingFamilyInviteToken();
        setPendingPreview(null);
        setSubmitError('This family invite expired. Ask the family admin for a new invite.');
        setPendingState('terminal');
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [pendingPreview, pendingState]);

  async function handleStartFamily() {
    if (isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const result = await startFamily();

      if (__DEV__) {
        console.info('[onboarding] startFamily result', {
          hasFamily: Boolean(result.context.organization),
        });
      }

      auth.applyProfilePatch({
        family: result.context,
      });
      router.replace('/onboarding/connect-device');
      void auth.refreshSession();
    } catch (error) {
      if (error instanceof ApiError && error.code === 'ONBOARDING_REQUIRED') {
        await auth.refreshSession().catch(() => undefined);
        router.replace('/onboarding/details');
      } else if (error instanceof ApiError) {
        setSubmitError(error.message);
      } else {
        setSubmitError(error instanceof Error ? error.message : 'Failed to start the family.');
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleJoinFamilyPress() {
    setSubmitError(null);
    router.push('/onboarding/join-family');
  }

  async function handleAcceptPendingInvite() {
    if (!pendingToken || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const result = await joinFamily({ token: pendingToken });
      await clearPendingFamilyInviteToken();
      auth.applyProfilePatch({
        family: result.context,
        onboardingCompleted: true,
      });
      await auth.refreshSession();
      router.replace('/home');
    } catch (error) {
      if (error instanceof ApiError && error.code === 'ALREADY_IN_FAMILY') {
        setSubmitError('You are already in a family. Your membership was not changed.');
      } else if (
        error instanceof ApiError &&
        (error.code === 'INVITE_ALREADY_USED' || error.status === 410)
      ) {
        await clearPendingFamilyInviteToken();
        setSubmitError('This family invite has expired or was already used.');
      } else {
        setSubmitError(
          error instanceof Error ? error.message : 'Could not join this family.',
        );
      }
      setPendingState('terminal');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDismissPendingInvite() {
    await clearPendingFamilyInviteToken();
    setPendingToken(null);
    setPendingPreview(null);
    setSubmitError(null);
    setPendingState('none');
  }

  const familyName = pendingPreview
    ? pendingPreview.organization.familyName ?? pendingPreview.organization.name
    : null;
  const remainingSeconds = pendingPreview
    ? Math.max(0, Math.ceil((new Date(pendingPreview.expiresAt).getTime() - now) / 1000))
    : 0;
  const remainingLabel = `${String(Math.floor(remainingSeconds / 60)).padStart(2, '0')}:${String(remainingSeconds % 60).padStart(2, '0')}`;

  return (
    <MinimalOnboardingScreen
      backHref="/onboarding/details"
      progressCurrent={2}
      progressTotal={4}
      subtitle="Choose whether you’re setting up StepWhere for your household or joining someone else’s."
      title="Family setup">
      {pendingState === 'loading' ? (
        <View style={styles.inviteCard}>
          <Text style={styles.inviteTitle}>Checking your family invite…</Text>
          <Text style={styles.inviteBody}>One moment while we verify it.</Text>
        </View>
      ) : pendingState === 'preview' && pendingPreview ? (
        <View style={styles.inviteCard}>
          <Text style={styles.inviteEyebrow}>INVITED AS MEMBER</Text>
          <Text style={styles.inviteTitle}>Join {familyName}</Text>
          <Text style={styles.inviteBody}>
            Accept to join this family and finish setting up StepWhere.
          </Text>
          <Text style={styles.inviteExpiry}>Invite expires in {remainingLabel}</Text>
          <AuthPrimaryButton
            disabled={isSubmitting}
            icon="account-plus"
            label={isSubmitting ? 'Joining…' : 'Join family'}
            onPress={() => {
              void handleAcceptPendingInvite();
            }}
          />
          <Pressable
            disabled={isSubmitting}
            onPress={() => {
              void handleDismissPendingInvite();
            }}
            style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
          >
            <Text style={styles.secondaryButtonLabel}>Not now</Text>
          </Pressable>
          {submitError ? <Text style={styles.errorText}>{submitError}</Text> : null}
        </View>
      ) : pendingState === 'terminal' ? (
        <View style={styles.inviteCard}>
          <Text style={styles.inviteTitle}>Invite unavailable</Text>
          <Text style={styles.errorText}>{submitError}</Text>
          <AuthPrimaryButton
            label="Choose another option"
            onPress={() => {
              void handleDismissPendingInvite();
            }}
          />
        </View>
      ) : (
      <View style={styles.options}>
        <FamilyPathCard
          accent="green"
          disabled={isSubmitting}
          icon="family"
          label="Admin"
          onPress={() => {
            void handleStartFamily();
          }}
          subtitle={isSubmitting ? 'Creating the family...' : 'Create your family, then add your first child and connect their shoe.'}
          title="Start a family"
        />
        <FamilyPathCard
          accent="blue"
          disabled={isSubmitting}
          icon="account-plus"
          label="Member"
          onPress={handleJoinFamilyPress}
          subtitle="Use an invite from a family admin to join their existing family."
          title="Join a family"
        />
        {submitError ? <Text style={styles.errorText}>{submitError}</Text> : null}
      </View>
      )}
    </MinimalOnboardingScreen>
  );
}

const styles = StyleSheet.create(theme => ({
  options: {
    flex: 1,
    gap: theme.spacing[3],
  },
  errorText: {
    color: theme.colors.alertText,
    fontFamily: theme.typography.family.body,
    fontSize: 13,
    lineHeight: 18,
  },
  inviteCard: {
    gap: theme.spacing[4],
    borderRadius: theme.radius.card,
    borderWidth: 1,
    borderColor: theme.colors.chrome.cardBorder,
    backgroundColor: theme.colors.surface,
    padding: theme.spacing[5],
  },
  inviteEyebrow: {
    color: theme.colors.primaryGreen,
    fontFamily: theme.typography.family.body,
    fontSize: 11,
    fontWeight: theme.typography.weight.bold,
    letterSpacing: 1,
  },
  inviteTitle: {
    color: theme.colors.text,
    fontFamily: theme.typography.family.display,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: theme.typography.weight.bold,
  },
  inviteBody: {
    color: theme.colors.textSecondary,
    fontFamily: theme.typography.family.body,
    fontSize: 14,
    lineHeight: 21,
  },
  inviteExpiry: {
    color: theme.colors.primaryGreen,
    fontFamily: theme.typography.family.body,
    fontSize: 13,
    fontWeight: theme.typography.weight.semibold,
  },
  secondaryButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonLabel: {
    color: theme.colors.textSecondary,
    fontFamily: theme.typography.family.body,
    fontSize: 14,
    fontWeight: theme.typography.weight.semibold,
  },
  pressed: {
    opacity: theme.colors.button.pressedOpacity,
  },
}));
