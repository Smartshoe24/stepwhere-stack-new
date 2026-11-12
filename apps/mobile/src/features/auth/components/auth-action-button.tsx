import React from 'react';
import { Pressable, Text } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

type AuthActionButtonProps = {
  compact?: boolean;
  disabled?: boolean;
  label: string;
  onPress: () => void;
};

export function AuthActionButton({
  compact = false,
  disabled = false,
  label,
  onPress,
}: AuthActionButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button(disabled, compact),
        pressed && !disabled && styles.pressed,
      ]}>
      <Text style={styles.label(disabled)}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create(theme => ({
  button: (disabled: boolean, compact: boolean) => ({
    minHeight: compact ? 50 : 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: disabled
      ? (theme.colors.background === '#000000' ? '#2A2727' : '#E6DED6')
      : (theme.colors.background === '#000000' ? '#F4EFE9' : '#151313'),
  }),
  pressed: {
    opacity: 0.88,
  },
  label: (disabled: boolean) => ({
    color: disabled
      ? theme.colors.textMuted
      : (theme.colors.background === '#000000' ? '#151313' : '#FFFFFF'),
    fontFamily: theme.typography.family.display,
    fontSize: 16,
    lineHeight: 20,
    fontWeight: theme.typography.weight.semibold,
  }),
}));
