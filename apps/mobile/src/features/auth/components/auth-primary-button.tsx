import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { AppIcon } from '@/components/ui/app-icon';

type AuthPrimaryButtonProps = {
  accessibilityLabel?: string;
  disabled?: boolean;
  icon?: React.ComponentProps<typeof AppIcon>['name'];
  label: string;
  onPress: () => void;
};

export function AuthPrimaryButton({
  accessibilityLabel,
  disabled = false,
  icon,
  label,
  onPress,
}: AuthPrimaryButtonProps) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button(disabled),
        pressed && !disabled && styles.pressed,
      ]}>
      <Text style={styles.label(disabled)}>{label}</Text>
      {icon ? (
        <View style={styles.iconWrap}>
          <AppIcon color={styles.icon.color} name={icon} size={18} />
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create(theme => ({
  button: (disabled: boolean) => ({
    minHeight: 54,
    borderRadius: theme.radius.button,
    paddingHorizontal: theme.spacing[5],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing[2],
    backgroundColor: disabled ? theme.colors.surfaceMuted : theme.colors.primaryGreen,
    borderWidth: 1,
    borderColor: disabled ? theme.colors.chrome.cardBorder : theme.colors.deepGreen,
    ...theme.shadows.card,
  }),
  pressed: {
    opacity: 0.88,
  },
  label: (disabled: boolean) => ({
    color: disabled ? theme.colors.textMuted : '#FFFFFF',
    fontFamily: theme.typography.family.display,
    fontSize: 15,
    fontWeight: theme.typography.weight.semibold,
    lineHeight: 18,
  }),
  iconWrap: {
    marginTop: 1,
  },
  icon: {
    color: '#FFFFFF',
  },
}));
