import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { AppIcon } from '@/components/ui/app-icon';

type SwitchFamilyCardProps = {
  disabled?: boolean;
  onPress: () => void;
};

export function SwitchFamilyCard({ disabled = false, onPress }: SwitchFamilyCardProps) {
  return (
    <Pressable
      accessibilityLabel="Switch family"
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.card, disabled && styles.disabled, pressed && !disabled && styles.pressed]}
    >
      <View style={styles.iconPlate}>
        <AppIcon color={styles.icon.color} name="account-switch" size={20} />
      </View>
      <View style={styles.copy}>
        <Text style={styles.title}>Switch family</Text>
        <Text style={styles.subtitle}>Leave this family so you can join another.</Text>
      </View>
      <AppIcon color={styles.chevron.color} name="chevron-right" size={18} />
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  card: {
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
  iconPlate: {
    width: 40,
    height: 40,
    borderRadius: theme.radius.circle,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surfaceMuted,
  },
  icon: {
    color: theme.colors.text,
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
  subtitle: {
    color: theme.colors.textSecondary,
    fontFamily: theme.typography.family.body,
    ...theme.typography.text.meta,
  },
  chevron: {
    color: theme.colors.textMuted,
  },
  disabled: {
    opacity: 0.45,
  },
  pressed: {
    opacity: theme.colors.button.pressedOpacity,
  },
}));
