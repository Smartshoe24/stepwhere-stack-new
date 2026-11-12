import { useRouter } from 'expo-router';
import React from 'react';
import { AppState, Pressable, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { AppIcon } from '@/components/ui/app-icon';
import {
  AuthOtpField,
  type AuthOtpFieldHandle,
} from '@/features/auth/components/auth-otp-field';
import { AuthPrimaryButton } from '@/features/auth/components/auth-primary-button';
import { AuthScreenShell } from '@/features/auth/components/auth-screen-shell';
import {
  clearAccountDeletionChallenge,
  getAccountDeletionChallenge,
  getAccountDeletionExpiryCountdown,
  getAccountDeletionResendCountdown,
  isAccountDeletionChallengeActive,
  markAccountDeletionNotice,
  type PersistedAccountDeletionChallenge,
  saveAccountDeletionChallenge,
} from '@/features/profile/account-deletion-challenge-session';
import {
  confirmAccountDeletion,
  requestAccountDeletionChallenge,
} from '@/features/profile/account-deletion-client';
import { getDeletionRecap } from '@/features/profile/account-deletion-visuals';
import { formatCountdown, maskPhoneNumber } from '@/features/profile/profile-formatters';
import { ProfileNoticeBanner } from '@/features/profile/profile-states';
import { ApiError } from '@/lib/api-client';

const OTP_LENGTH = 6;

export default function DeleteAccountOtpScreen() {
  const router = useRouter();
  const otpRef = React.useRef<AuthOtpFieldHandle | null>(null);
  const [challenge, setChallenge] = React.useState<PersistedAccountDeletionChallenge | null>(null);
  const [isHydrating, setIsHydrating] = React.useState(true);
  const [code, setCode] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [isResending, setIsResending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [now, setNow] = React.useState(() => Date.now());

  const resendCountdown = getAccountDeletionResendCountdown(challenge, now);
  const expiryCountdown = getAccountDeletionExpiryCountdown(challenge, now);

  // Step guard: a direct entry without a live challenge goes back to step one.
  React.useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      const stored = await getAccountDeletionChallenge();

      if (cancelled) {
        return;
      }

      if (!stored) {
        router.replace('/delete-account/confirm' as never);
        return;
      }

      setChallenge(stored);
      setIsHydrating(false);
    }

    void hydrate();

    return () => {
      cancelled = true;
    };
  }, [router]);

  // One ticker drives both countdowns, and a foreground event re-checks expiry
  // because timers do not fire reliably while backgrounded.
  React.useEffect(() => {
    if (!challenge) {
      return;
    }

    const interval = setInterval(() => setNow(Date.now()), 1000);
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') {
        setNow(Date.now());
      }
    });

    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, [challenge]);

  React.useEffect(() => {
    if (!challenge || isAccountDeletionChallengeActive(challenge, now)) {
      return;
    }

    void clearAccountDeletionChallenge();
    router.replace('/delete-account/confirm' as never);
  }, [challenge, now, router]);

  async function handleConfirm() {
    if (!challenge || isSubmitting || code.length !== OTP_LENGTH) {
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const confirmation = await confirmAccountDeletion({
        challengeToken: challenge.challengeToken,
        code,
      });
      await clearAccountDeletionChallenge();
      // The server invalidates every session immediately. Persist the notice
      // before navigating so an auth refresh cannot skip the recovery guidance.
      await markAccountDeletionNotice(confirmation.undoUntil);
      router.replace({
        pathname: '/delete-account/done',
        params: {
          adminTransferred: String(confirmation.adminTransferred),
          trackingStopped: String(confirmation.trackingStopped),
          undoUntil: confirmation.undoUntil,
        },
      } as never);
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : 'Could not verify that code. Try again.',
      );
      setCode('');
      otpRef.current?.focus();
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleResend() {
    if (!challenge || isResending || resendCountdown > 0) {
      return;
    }

    setIsResending(true);
    setError(null);

    try {
      const next = await requestAccountDeletionChallenge();
      await saveAccountDeletionChallenge(next);
      setChallenge(next);
      setCode('');
      otpRef.current?.focus();
    } catch {
      setError('Could not resend the code. Try again.');
    } finally {
      setIsResending(false);
    }
  }

  if (isHydrating || !challenge) {
    return (
      <AuthScreenShell
        subtitle="Checking your verification request."
        title="Confirm deletion"
      >
        <View style={styles.body} />
      </AuthScreenShell>
    );
  }

  return (
    <AuthScreenShell
      backHref="/delete-account/confirm"
      subtitle={`Enter the ${OTP_LENGTH}-digit code sent to ${maskPhoneNumber(challenge.phoneNumber)}.`}
      title="Confirm deletion"
    >
      <View style={styles.body}>
        {/* One line, from the same source the review screen uses. */}
        <View style={styles.recap}>
          <AppIcon color={styles.recapIcon.color} name="exclamation" size={16} />
          <Text style={styles.recapText}>{getDeletionRecap(challenge.impact)}</Text>
        </View>

        <AuthOtpField
          autoFocus
          onChangeText={value => {
            setCode(value);
            setError(null);
          }}
          ref={otpRef}
          value={code}
        />

        <View style={styles.expiryRow}>
          <AppIcon color={styles.expiryIcon.color} name="clock" size={14} />
          <Text style={styles.expiryText}>
            {`Code expires in ${formatCountdown(expiryCountdown)}`}
          </Text>
        </View>

        {error ? <ProfileNoticeBanner message={error} /> : null}

        <AuthPrimaryButton
          disabled={isSubmitting || code.length !== OTP_LENGTH}
          icon="trash"
          label={isSubmitting ? 'Confirming…' : 'Delete my account'}
          onPress={() => {
            void handleConfirm();
          }}
        />

        <Pressable
          accessibilityLabel="Resend verification code"
          accessibilityRole="button"
          accessibilityState={{ disabled: resendCountdown > 0 || isResending }}
          disabled={resendCountdown > 0 || isResending}
          onPress={() => {
            void handleResend();
          }}
          style={({ pressed }) => [
            styles.resendButton,
            (resendCountdown > 0 || isResending) && styles.resendDisabled,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.resendLabel}>
            {resendCountdown > 0
              ? `Resend code in ${formatCountdown(resendCountdown)}`
              : isResending
                ? 'Sending…'
                : 'Resend code'}
          </Text>
        </Pressable>

      </View>
    </AuthScreenShell>
  );
}

const styles = StyleSheet.create(theme => ({
  body: {
    gap: theme.spacing[4],
  },
  recap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[2],
    padding: theme.spacing[3],
    borderRadius: theme.radius.button,
    backgroundColor: theme.colors.alertBackground,
  },
  recapIcon: {
    color: theme.colors.alertText,
  },
  recapText: {
    flex: 1,
    color: theme.colors.alertText,
    fontFamily: theme.typography.family.body,
    ...theme.typography.text.body,
    fontWeight: theme.typography.weight.medium,
  },
  expiryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing[1],
  },
  expiryIcon: {
    color: theme.colors.textMuted,
  },
  expiryText: {
    color: theme.colors.textMuted,
    fontFamily: theme.typography.family.body,
    ...theme.typography.text.caption,
    ...theme.typography.tabular,
  },
  resendButton: {
    alignSelf: 'center',
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing[4],
  },
  resendDisabled: {
    opacity: 0.45,
  },
  resendLabel: {
    color: theme.colors.text,
    fontFamily: theme.typography.family.body,
    ...theme.typography.text.body,
    ...theme.typography.tabular,
    fontWeight: theme.typography.weight.semibold,
  },
  devHint: {
    textAlign: 'center',
    color: theme.colors.textMuted,
    fontFamily: theme.typography.family.body,
    ...theme.typography.text.caption,
  },
  pressed: {
    opacity: theme.colors.button.pressedOpacity,
  },
}));
