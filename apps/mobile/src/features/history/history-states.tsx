import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { ShoeLoader } from '@/components/loading/shoe-loader';
import { AppIcon, type AppIconName } from '@/components/ui/app-icon';

/** App convention: ShoeLoader, not a bespoke skeleton. */
export function HistoryLoadingState() {
  return (
    <View accessibilityLabel="Loading history" style={styles.loading}>
      <ShoeLoader size={64} />
    </View>
  );
}

export function HistoryErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View style={styles.card}>
      <View style={styles.banner}>
        <Text style={styles.bannerText}>{message}</Text>
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={onRetry}
        style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}>
        <Text style={styles.secondaryLabel}>Try again</Text>
      </Pressable>
    </View>
  );
}

export function HistoryEmptyState({
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
          style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}>
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
    fontSize: 20,
    fontWeight: theme.typography.weight.semibold,
  },
  body: {
    color: theme.colors.textSecondary,
    fontFamily: theme.typography.family.body,
    ...theme.typography.text.body,
    lineHeight: 19,
  },
  banner: {
    padding: theme.spacing[3],
    borderRadius: theme.radius.button,
    backgroundColor: theme.colors.alertBackground,
  },
  bannerText: {
    color: theme.colors.alertText,
    fontFamily: theme.typography.family.body,
    ...theme.typography.text.body,
  },
  // Neutral outlined action; a solid navActive fill would borrow a nav token.
  secondaryButton: {
    alignSelf: 'flex-start',
    minHeight: 42,
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
