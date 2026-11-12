import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { ShoeLoader } from '@/components/loading/shoe-loader';
import { AppIcon, type AppIconName } from '@/components/ui/app-icon';

/** App convention: ShoeLoader, not a bespoke skeleton. */
export function ProfileLoadingState() {
  return (
    <View accessibilityLabel="Loading profile" style={styles.loading}>
      <ShoeLoader size={64} />
    </View>
  );
}

/**
 * Inline banner for transient profile feedback. Replaces the bare centered
 * alert-colored text the screen used to render mid-scroll.
 */
export function ProfileNoticeBanner({
  message,
  tone = 'alert',
}: {
  message: string;
  tone?: 'alert' | 'info';
}) {
  return (
    <View accessibilityLiveRegion="polite" style={styles.banner(tone)}>
      <AppIcon
        color={tone === 'alert' ? styles.bannerAlertGlyph.color : styles.bannerInfoGlyph.color}
        name={tone === 'alert' ? 'exclamation' : 'info'}
        size={16}
      />
      <Text style={styles.bannerText(tone)}>{message}</Text>
    </View>
  );
}

export function ProfileErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <View style={styles.card}>
      <ProfileNoticeBanner message={message} />
      <Pressable
        accessibilityRole="button"
        onPress={onRetry}
        style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
      >
        <Text style={styles.secondaryLabel}>Try again</Text>
      </Pressable>
    </View>
  );
}

export function ProfileEmptyState({
  action,
  body,
  icon,
  title,
}: {
  action?: { label: string; onPress: () => void };
  body: string;
  icon: AppIconName;
  title: string;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.emptyIcon}>
        <AppIcon color={styles.emptyIconGlyph.color} name={icon} size={26} />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{body}</Text>
      {action ? (
        <Pressable
          accessibilityRole="button"
          onPress={action.onPress}
          style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
        >
          <Text style={styles.secondaryLabel}>{action.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create(theme => ({
  loading: {
    marginTop: theme.spacing[7],
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    marginTop: theme.spacing[4],
    marginHorizontal: theme.spacing[5],
    padding: theme.spacing[6],
    borderRadius: theme.radius.card,
    borderWidth: 1,
    borderColor: theme.colors.chrome.cardBorder,
    backgroundColor: theme.colors.surface,
    gap: theme.spacing[2],
    ...theme.shadows.card,
  },
  emptyIcon: {
    width: 44,
    height: 44,
    borderRadius: theme.radius.cardSmall,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing[1],
    backgroundColor: theme.colors.surfaceMuted,
  },
  emptyIconGlyph: {
    color: theme.colors.textMuted,
  },
  title: {
    color: theme.colors.text,
    fontFamily: theme.typography.family.display,
    ...theme.typography.text.titleSmall,
    fontWeight: theme.typography.weight.semibold,
  },
  body: {
    color: theme.colors.textSecondary,
    fontFamily: theme.typography.family.body,
    ...theme.typography.text.body,
  },
  banner: (tone: 'alert' | 'info') => ({
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[2],
    padding: theme.spacing[3],
    borderRadius: theme.radius.button,
    backgroundColor: tone === 'alert'
      ? theme.colors.alertBackground
      : theme.colors.surfaceMuted,
  }),
  bannerAlertGlyph: {
    color: theme.colors.alertText,
  },
  bannerInfoGlyph: {
    color: theme.colors.textSecondary,
  },
  bannerText: (tone: 'alert' | 'info') => ({
    flex: 1,
    color: tone === 'alert' ? theme.colors.alertText : theme.colors.textSecondary,
    fontFamily: theme.typography.family.body,
    ...theme.typography.text.body,
  }),
  // Neutral outlined action; a solid navActive fill would borrow a nav token.
  secondaryButton: {
    alignSelf: 'flex-start',
    minHeight: 44,
    justifyContent: 'center',
    marginTop: theme.spacing[2],
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
  pressed: {
    opacity: theme.colors.button.pressedOpacity,
  },
}));
