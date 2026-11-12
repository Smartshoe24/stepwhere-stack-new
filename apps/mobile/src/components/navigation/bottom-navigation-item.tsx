import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { AppIcon } from '@/components/ui/app-icon';

type BottomNavigationItemProps = {
  active: boolean;
  disabled?: boolean;
  icon: React.ComponentProps<typeof AppIcon>['name'];
  label: string;
  onPress?: () => void;
};

export function BottomNavigationItem({
  active,
  disabled = false,
  icon,
  label,
  onPress,
}: BottomNavigationItemProps) {
  const { theme } = useUnistyles();
  const activeColor = theme.colors.navActive;
  const inactiveColor = theme.colors.textSecondary;
  const disabledColor = theme.colors.textVeryMuted;
  const iconColor = disabled ? disabledColor : active ? activeColor : inactiveColor;
  const iconHighlight = disabled
    ? 'transparent'
    : active ? theme.colors.button.highlightActive : theme.colors.button.highlight;

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="tab"
      accessibilityState={{ disabled, selected: active }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
      ]}>
      <View style={[styles.iconWrap, { backgroundColor: iconHighlight }]}>
        <AppIcon color={iconColor} name={icon} size={22} />
      </View>
      <Text style={[styles.label(active), { color: iconColor }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create(theme => ({
  button: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  pressed: {
    opacity: 0.75,
  },
  disabled: {
    opacity: 0.65,
  },
  iconWrap: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius.circle,
  },
  label: (active: boolean) => ({
    fontFamily: theme.typography.family.body,
    fontSize: theme.typography.size.navLabel,
    fontWeight: active ? theme.typography.weight.semibold : theme.typography.weight.regular,
    lineHeight: 13,
  }),
}));
