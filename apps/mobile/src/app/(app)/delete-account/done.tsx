import { useLocalSearchParams } from 'expo-router';
import React from 'react';
import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { AppIcon } from '@/components/ui/app-icon';
import { AuthPrimaryButton } from '@/features/auth/components/auth-primary-button';
import { AuthScreenShell } from '@/features/auth/components/auth-screen-shell';
import { useAuth } from '@/features/auth/use-auth';
import { markAccountDeletionNotice } from '@/features/profile/account-deletion-challenge-session';
import { getUndoPeriodHours } from '@/features/profile/account-deletion-client';
import { formatGracePeriodEnd } from '@/features/profile/profile-formatters';
import { ProfileNoticeBanner } from '@/features/profile/profile-states';

/**
 * Terminal step. The confirmation is shown *before* signing out, because
 * `signOut` unmounts this screen — the `(app)` layout redirects on `signedOut`.
 */
export default function DeleteAccountDoneScreen() {
  const auth = useAuth();
  const params = useLocalSearchParams<{
    adminTransferred?: string | string[];
    trackingStopped?: string | string[];
    undoUntil?: string | string[];
  }>();
  const [isSigningOut, setIsSigningOut] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const undoUntilParam = Array.isArray(params.undoUntil) ? params.undoUntil[0] : params.undoUntil;
  const undoUntil = formatGracePeriodEnd(undoUntilParam);
  const adminTransferred = (Array.isArray(params.adminTransferred)
    ? params.adminTransferred[0]
    : params.adminTransferred) === 'true';
  const trackingStopped = (Array.isArray(params.trackingStopped)
    ? params.trackingStopped[0]
    : params.trackingStopped) === 'true';

  async function handleFinish() {
    if (isSigningOut) {
      return;
    }

    setIsSigningOut(true);
    setError(null);

    try {
      // Written before sign-out; the sign-in screen consumes it on mount.
      await markAccountDeletionNotice(undoUntilParam ?? null);
      await auth.signOut();
    } catch {
      setError('Could not log you out. Try again.');
      setIsSigningOut(false);
    }
  }

  return (
    <AuthScreenShell
      subtitle="Your account is marked for deletion."
      title="Deletion scheduled"
    >
      <View style={styles.body}>
        <View style={styles.iconPlate}>
          <AppIcon color={styles.icon.color} name="check" size={26} />
        </View>

        <Text style={styles.headline}>Request received</Text>
        <Text style={styles.copy}>
          {undoUntil
            ? `Sign in before ${undoUntil} to cancel.`
            : `Sign in within ${getUndoPeriodHours()} hours to cancel.`}
        </Text>

        {/* Only stated when it is not the obvious default. */}
        {adminTransferred || trackingStopped ? (
          <View style={styles.noteRow}>
            <AppIcon color={styles.noteIcon.color} name="info" size={16} />
            <Text style={styles.noteText}>
              {adminTransferred ? 'Admin moved to another member.' : 'Tracking has stopped.'}
            </Text>
          </View>
        ) : null}

        {error ? <ProfileNoticeBanner message={error} /> : null}

        <AuthPrimaryButton
          disabled={isSigningOut}
          icon="logout"
          label={isSigningOut ? 'Logging out…' : 'Log out'}
          onPress={() => {
            void handleFinish();
          }}
        />
      </View>
    </AuthScreenShell>
  );
}

const styles = StyleSheet.create(theme => ({
  body: {
    gap: theme.spacing[3],
  },
  iconPlate: {
    width: 44,
    height: 44,
    borderRadius: theme.radius.cardSmall,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.softGreen,
  },
  icon: {
    color: theme.colors.primaryGreen,
  },
  headline: {
    color: theme.colors.text,
    fontFamily: theme.typography.family.display,
    ...theme.typography.text.titleSmall,
    fontWeight: theme.typography.weight.semibold,
  },
  copy: {
    color: theme.colors.textSecondary,
    fontFamily: theme.typography.family.body,
    ...theme.typography.text.body,
  },
  noteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[2],
    marginTop: theme.spacing[1],
    padding: theme.spacing[3],
    borderRadius: theme.radius.button,
    backgroundColor: theme.colors.surfaceMuted,
  },
  noteIcon: {
    color: theme.colors.textSecondary,
  },
  noteText: {
    flex: 1,
    color: theme.colors.textSecondary,
    fontFamily: theme.typography.family.body,
    ...theme.typography.text.meta,
  },
}));
