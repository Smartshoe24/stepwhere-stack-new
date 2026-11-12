import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { AppIcon } from '@/components/ui/app-icon';

type AddChildButtonProps = {
  onPress?: () => void;
  size?: 'default' | 'compact';
};

export function AddChildButton({ onPress, size = 'default' }: AddChildButtonProps) {
  const isCompact = size === 'compact';

  return (
    <Pressable
      accessibilityLabel="Add child"
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.container(isCompact), pressed && styles.pressed]}>
      <View style={styles.circle(isCompact)}>
        <AppIcon color={styles.icon.color} name="plus" size={isCompact ? 18 : 22} />
      </View>
      <Text style={styles.label(isCompact)}>Add</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create(theme => ({
  container: (compact: boolean) => ({
    width: compact ? 52 : 64,
    alignItems: 'center',
    gap: theme.spacing[2],
  }),
  pressed: {
    opacity: theme.colors.button.pressedOpacity,
  },
  icon: {
    color: theme.colors.primaryGreen,
  },
  circle: (compact: boolean) => ({
    width: compact ? 48 : 58,
    height: compact ? 48 : 58,
    borderRadius: theme.radius.circle,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.button.surface,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: theme.colors.chrome.cardBorder,
  }),
  label: (compact: boolean) => ({
    color: theme.colors.textMuted,
    textAlign: 'center',
    fontFamily: theme.typography.family.body,
    fontSize: compact ? 9 : 10,
    lineHeight: compact ? 11 : 12,
    fontWeight: theme.typography.weight.medium,
  }),
}));
