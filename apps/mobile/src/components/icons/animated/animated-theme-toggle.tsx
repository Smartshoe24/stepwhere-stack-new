import React from "react";
import { Pressable } from "react-native";
import { StyleSheet } from "react-native-unistyles";

import { AnimatedThemeIcon } from "@/components/icons/animated/animated-theme-icon";

export type ThemeToggleOrigin = {
  x: number;
  y: number;
};

type AnimatedThemeToggleProps = {
  animateIcon?: boolean;
  disabled?: boolean;
  onPress: (origin: ThemeToggleOrigin) => void;
  themeName: "light" | "dark";
};

export function AnimatedThemeToggle({
  animateIcon = true,
  disabled = false,
  onPress,
  themeName,
}: AnimatedThemeToggleProps) {
  return (
    <Pressable
      accessibilityLabel={
        themeName === "dark" ? "Switch to light theme" : "Switch to dark theme"
      }
      accessibilityRole="button"
      disabled={disabled}
      onPress={(event) => {
        onPress({
          x: event.nativeEvent.pageX,
          y: event.nativeEvent.pageY,
        });
      }}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
    >
      <AnimatedThemeIcon animated={animateIcon} themeName={themeName} />
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  button: {
    width: 38,
    height: 38,
    borderRadius: theme.radius.circle,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.button.surface,
    borderWidth: 1,
    borderColor: theme.colors.button.border,
    ...theme.shadows.card,
  },
  pressed: {
    opacity: theme.colors.button.pressedOpacity,
  },
}));
