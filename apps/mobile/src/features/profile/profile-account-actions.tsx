import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { AppIcon } from '@/components/ui/app-icon';

type ProfileAccountActionsProps = {
  isSigningOut: boolean;
  onDeleteAccountPress: () => void;
  onSignOut: () => void;
};

/**
 * Logout is a neutral row. `alert*` tokens are reserved for the genuinely
 * irreversible action below it, so the two are not visually interchangeable.
 */
export function ProfileAccountActions({
  isSigningOut,
  onDeleteAccountPress,
  onSignOut,
}: ProfileAccountActionsProps) {
  return (
    <View style={styles.group}>
      <Pressable
        accessibilityLabel="Log out"
        accessibilityRole="button"
        accessibilityState={{ disabled: isSigningOut }}
        disabled={isSigningOut}
        onPress={onSignOut}
        style={({ pressed }) => [
          styles.row,
          isSigningOut && styles.disabled,
          pressed && !isSigningOut && styles.pressed,
        ]}
      >
        <View style={styles.iconPlate}>
          <AppIcon color={styles.icon.color} name="logout" size={20} />
        </View>
        <View style={styles.copy}>
          <Text style={styles.title}>{isSigningOut ? 'Logging out…' : 'Log out'}</Text>
          <Text style={styles.subtitle}>You will be logged out from this phone.</Text>
        </View>
        <AppIcon color={styles.chevron.color} name="chevron-right" size={18} />
      </Pressable>

      <Pressable
        accessibilityLabel="Delete account"
        accessibilityRole="button"
        onPress={onDeleteAccountPress}
        style={({ pressed }) => [styles.row, styles.destructiveRow, pressed && styles.pressed]}
      >
        <View style={[styles.iconPlate, styles.destructiveIconPlate]}>
          <AppIcon color={styles.destructiveIcon.color} name="trash" size={20} />
        </View>
        <View style={styles.copy}>
          <Text style={[styles.title, styles.destructiveTitle]}>Delete account</Text>
          <Text style={styles.subtitle}>
            Review and permanently delete your Stepwhere account.
          </Text>
        </View>
        <AppIcon color={styles.destructiveChevron.color} name="chevron-right" size={18} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create(theme => ({
  group: {
    marginTop: theme.spacing[4],
    marginHorizontal: theme.spacing[5],
    gap: theme.spacing[3],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[3],
    borderRadius: theme.radius.card,
    borderWidth: 1,
    borderColor: theme.colors.chrome.cardBorder,
    backgroundColor: theme.colors.surface,
    padding: theme.spacing[4],
    ...theme.shadows.card,
  },
  destructiveRow: {
    borderColor: theme.colors.alertBorder,
  },
  iconPlate: {
    width: 40,
    height: 40,
    borderRadius: theme.radius.circle,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surfaceMuted,
  },
  destructiveIconPlate: {
    backgroundColor: theme.colors.alertBackground,
  },
  icon: {
    color: theme.colors.icon,
  },
  destructiveIcon: {
    color: theme.colors.alertText,
  },
  copy: {
    flex: 1,
    gap: 2,
  },
  title: {
    color: theme.colors.text,
    fontFamily: theme.typography.family.display,
    ...theme.typography.text.bodyLarge,
    fontWeight: theme.typography.weight.medium,
  },
  destructiveTitle: {
    color: theme.colors.alertText,
  },
  subtitle: {
    color: theme.colors.textSecondary,
    fontFamily: theme.typography.family.body,
    ...theme.typography.text.meta,
  },
  chevron: {
    color: theme.colors.textMuted,
  },
  destructiveChevron: {
    color: theme.colors.alertText,
  },
  disabled: {
    opacity: 0.45,
  },
  pressed: {
    opacity: theme.colors.button.pressedOpacity,
  },
}));
