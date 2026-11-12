import React from "react";
import { Pressable, ViewStyle } from "react-native";
import { StyleSheet } from "react-native-unistyles";

import { AppIcon } from "@/components/ui/app-icon";

type IconButtonProps = {
  active?: boolean;
  activeBackgroundColor?: string;
  activeBorderColor?: string;
  accessibilityLabel: string;
  disabled?: boolean;
  icon: React.ComponentProps<typeof AppIcon>["name"];
  iconColor?: string;
  onPress?: () => void;
  size?: number;
  style?: ViewStyle;
};

export function IconButton({
  active = false,
  activeBackgroundColor,
  activeBorderColor,
  accessibilityLabel,
  disabled = false,
  icon,
  iconColor,
  onPress,
  size = 44,
  style,
}: IconButtonProps) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.button(size),
        active && styles.activeButton(activeBackgroundColor, activeBorderColor),
        pressed && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}
    >
      <AppIcon color={iconColor ?? styles.icon.color} name={icon} size={20} />
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  icon: {
    color: theme.colors.button.icon,
  },
  button: (size: number) => ({
    width: size,
    height: size,
    borderRadius: theme.radius.circle,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.button.surface,
    borderWidth: 1,
    borderColor: theme.colors.button.border,
    ...theme.shadows.card,
  }),
  activeButton: (backgroundColor?: string, borderColor?: string) => ({
    backgroundColor: backgroundColor ?? theme.colors.button.highlightActive,
    borderColor: borderColor ?? theme.colors.button.iconActive,
  }),
  pressed: {
    opacity: theme.colors.button.pressedOpacity,
  },
  disabled: {
    opacity: 0.45,
  },
}));
