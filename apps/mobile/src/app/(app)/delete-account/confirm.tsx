import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { ShoeLoader } from '@/components/loading/shoe-loader';
import { AppIcon } from '@/components/ui/app-icon';
import { AuthPrimaryButton } from '@/features/auth/components/auth-primary-button';
import { AuthScreenShell } from '@/features/auth/components/auth-screen-shell';
import { useAuth } from '@/features/auth/use-auth';
import type { AccountDeletionImpact } from '@/features/profile/account-deletion-challenge-session';
import { saveAccountDeletionChallenge } from '@/features/profile/account-deletion-challenge-session';
import {
  getAccountDeletionImpact,
  getUndoPeriodHours,
  requestAccountDeletionChallenge,
} from '@/features/profile/account-deletion-client';
import {
  buildDeletionRows,
  type DeletionRow,
  getDeletionCaveat,
  getDeletionSummary,
} from '@/features/profile/account-deletion-visuals';
import { maskPhoneNumber } from '@/features/profile/profile-formatters';
import { ProfileNoticeBanner } from '@/features/profile/profile-states';

export default function DeleteAccountConfirmScreen() {
  const auth = useAuth();
  const router = useRouter();
  const [isRequesting, setIsRequesting] = React.useState(false);
  const [impact, setImpact] = React.useState<AccountDeletionImpact | null>(null);
  const [impactError, setImpactError] = React.useState<string | null>(null);
  const [requestError, setRequestError] = React.useState<string | null>(null);
  const [isLoadingImpact, setIsLoadingImpact] = React.useState(true);
  const [reloadKey, setReloadKey] = React.useState(0);

  const user = auth.user;

  React.useEffect(() => {
    let cancelled = false;

    getAccountDeletionImpact()
      .then(nextImpact => {
        if (!cancelled) {
          setImpact(nextImpact);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setImpact(null);
          setImpactError("We couldn't load your account details.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingImpact(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  function handleRetryImpact() {
    setIsLoadingImpact(true);
    setImpactError(null);
    setReloadKey(current => current + 1);
  }

  async function handleRequestCode() {
    if (isRequesting || !impact) {
      return;
    }

    setIsRequesting(true);
    setRequestError(null);

    try {
      const challenge = await requestAccountDeletionChallenge();
      await saveAccountDeletionChallenge(challenge);
      router.push('/delete-account/otp' as never);
    } catch {
      setRequestError("We couldn't send the code. Please try again.");
    } finally {
      setIsRequesting(false);
    }
  }

  const caveat = impact ? getDeletionCaveat(impact) : null;

  return (
    <AuthScreenShell
      backHref="/profile"
      subtitle="Nothing is deleted until you enter the code."
      title="Delete account"
    >
      <View style={styles.body}>
        {isLoadingImpact ? (
          <View accessibilityLabel="Loading account details" style={styles.loading}>
            <ShoeLoader size={64} />
          </View>
        ) : null}

        {impactError ? (
          <View style={styles.errorGroup}>
            <ProfileNoticeBanner message={impactError} />
            <Pressable
              accessibilityLabel="Try loading account details again"
              accessibilityRole="button"
              onPress={handleRetryImpact}
              style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
            >
              <Text style={styles.secondaryLabel}>Try again</Text>
            </Pressable>
          </View>
        ) : null}

        {impact && !isLoadingImpact ? (
          <>
            <Text style={styles.summary}>{getDeletionSummary(impact)}</Text>

            <View style={styles.rows}>
              {buildDeletionRows(impact).map((row, index) => (
                <ConsequenceRow key={row.key} row={row} showDivider={index > 0} />
              ))}
            </View>

            {caveat ? <Text style={styles.caveat}>{caveat}</Text> : null}

            <View style={styles.undoRow}>
              <AppIcon color={styles.undoIcon.color} name="clock" size={16} />
              <Text style={styles.undoText}>
                {`Sign in within ${getUndoPeriodHours()} hours to cancel.`}
              </Text>
            </View>
          </>
        ) : null}

        {requestError ? <ProfileNoticeBanner message={requestError} /> : null}

        <AuthPrimaryButton
          disabled={isRequesting || isLoadingImpact || !impact}
          icon="keypad"
          label={isRequesting ? 'Sending…' : 'Send code'}
          onPress={() => {
            void handleRequestCode();
          }}
        />

        <Text style={styles.destination}>{maskPhoneNumber(user?.phoneNumber)}</Text>
      </View>
    </AuthScreenShell>
  );
}

/**
 * Label left, detail right — the same left/right split History uses for its
 * timeline rows. `removed` items get a struck label so the distinction between
 * removed and kept is visible without reading the tone chip.
 */
function ConsequenceRow({ row, showDivider }: { row: DeletionRow; showDivider: boolean }) {
  const isRemoved = row.tone === 'removed';

  return (
    <View
      accessibilityLabel={`${row.label}, ${row.detail}, ${isRemoved ? 'deleted' : 'kept'}`}
      accessible
      style={[styles.row, showDivider && styles.rowDivider]}
    >
      <AppIcon
        color={isRemoved ? styles.rowIconRemoved.color : styles.rowIconKept.color}
        name={row.icon}
        size={16}
      />
      <Text numberOfLines={1} style={styles.rowLabel(isRemoved)}>
        {row.label}
      </Text>
      <Text numberOfLines={1} style={styles.rowDetail}>
        {row.detail}
      </Text>
      {isRemoved ? null : <Text style={styles.keptTag}>Kept</Text>}
    </View>
  );
}

const styles = StyleSheet.create(theme => ({
  body: {
    gap: theme.spacing[4],
  },
  loading: {
    minHeight: 160,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summary: {
    color: theme.colors.text,
    fontFamily: theme.typography.family.body,
    ...theme.typography.text.body,
  },
  // One surface, one recipe: the committed 1px border plus shadows.card.
  rows: {
    borderRadius: theme.radius.cardSmall,
    borderWidth: 1,
    borderColor: theme.colors.chrome.cardBorder,
    backgroundColor: theme.colors.surface,
    ...theme.shadows.card,
  },
  row: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[3],
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
  },
  rowDivider: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.divider,
  },
  rowIconRemoved: {
    color: theme.colors.alertText,
  },
  rowIconKept: {
    color: theme.colors.textMuted,
  },
  rowLabel: (removed: boolean) => ({
    color: removed ? theme.colors.text : theme.colors.textMuted,
    fontFamily: theme.typography.family.body,
    ...theme.typography.text.body,
    fontWeight: theme.typography.weight.medium,
    textDecorationLine: removed ? ('line-through' as const) : ('none' as const),
  }),
  rowDetail: {
    flex: 1,
    textAlign: 'right',
    color: theme.colors.textSecondary,
    fontFamily: theme.typography.family.body,
    ...theme.typography.text.meta,
    ...theme.typography.tabular,
  },
  keptTag: {
    color: theme.colors.textMuted,
    fontFamily: theme.typography.family.body,
    ...theme.typography.text.overline,
    textTransform: 'uppercase',
    fontWeight: theme.typography.weight.semibold,
  },
  caveat: {
    color: theme.colors.textSecondary,
    fontFamily: theme.typography.family.body,
    ...theme.typography.text.meta,
  },
  undoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[2],
  },
  undoIcon: {
    color: theme.colors.textMuted,
  },
  undoText: {
    flex: 1,
    color: theme.colors.textSecondary,
    fontFamily: theme.typography.family.body,
    ...theme.typography.text.meta,
    ...theme.typography.tabular,
  },
  errorGroup: {
    gap: theme.spacing[2],
  },
  secondaryButton: {
    alignSelf: 'flex-start',
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing[4],
    borderRadius: theme.radius.button,
    borderWidth: 1,
    borderColor: theme.colors.chrome.cardBorder,
    backgroundColor: theme.colors.surface,
  },
  secondaryLabel: {
    color: theme.colors.text,
    fontFamily: theme.typography.family.body,
    ...theme.typography.text.body,
    fontWeight: theme.typography.weight.semibold,
  },
  destination: {
    textAlign: 'center',
    color: theme.colors.textMuted,
    fontFamily: theme.typography.family.body,
    ...theme.typography.text.caption,
    ...theme.typography.tabular,
  },
  pressed: {
    opacity: theme.colors.button.pressedOpacity,
  },
}));
