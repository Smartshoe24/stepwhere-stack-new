import React from "react";
import { Pressable, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import Animated, {
  useAnimatedStyle,
  withTiming,
} from "react-native-reanimated";

import { getGeofenceFillColors } from "@/components/home/geofence-presentation";
import { type GeofenceUiStatus } from "@/components/home/geofence-state";
import { AppIcon } from "@/components/ui/app-icon";

type SafetyFabProps = {
  bottomOffset: number;
  chromeHidden?: boolean;
  onPress?: () => void;
  state: GeofenceUiStatus;
};

export function SafetyFab({
  bottomOffset,
  chromeHidden = false,
  onPress,
  state,
}: SafetyFabProps) {
  const { theme } = useUnistyles();
  const fabContent = {
    breached: {
      accessibilityLabel: "Disable geofence",
      fillKey: "breached" as const,
      icon: "shield-half" as const,
      outerColor: theme.colors.geofence.breachedHalo,
    },
    disabled: {
      accessibilityLabel: "Enable geofence",
      fillKey: "inactive" as const,
      icon: "shield-off" as const,
      outerColor: theme.colors.geofence.disabledHalo,
    },
    editing: {
      accessibilityLabel: "Save geofence",
      fillKey: "editing" as const,
      icon: "save" as const,
      outerColor: theme.colors.geofence.editingHalo,
    },
    enabled: {
      accessibilityLabel: "Disable geofence",
      fillKey: "enabled" as const,
      icon: "shield-check" as const,
      outerColor: theme.colors.geofence.enabledHalo,
    },
    unset: {
      accessibilityLabel: "Enable geofence",
      fillKey: "inactive" as const,
      icon: "shield-off" as const,
      outerColor: theme.colors.geofence.unsetHalo,
    },
  } satisfies Record<
    GeofenceUiStatus,
    {
      accessibilityLabel: string;
      fillKey: keyof typeof theme.colors.geofence.fill;
      icon: React.ComponentProps<typeof AppIcon>["name"];
      outerColor: string;
    }
  >;
  const content = fabContent[state];
  // `onFill` instead of a hardcoded white: dark-mode accents are light, so white
  // glyphs on them measured as low as 2.5:1.
  const { fill, onFill } = getGeofenceFillColors(theme, content.fillKey);
  const animatedStyle = useAnimatedStyle(
    () => ({
      opacity: withTiming(chromeHidden ? 0 : 1, { duration: 180 }),
      transform: [
        { translateY: withTiming(chromeHidden ? 16 : 0, { duration: 180 }) },
      ],
    }),
    [chromeHidden],
  );

  return (
    <Animated.View
      pointerEvents={chromeHidden ? "none" : "auto"}
      style={[styles.wrap(bottomOffset), animatedStyle]}
    >
      <View style={styles.halo(content.outerColor)}>
        <Pressable
          accessibilityLabel={content.accessibilityLabel}
          accessibilityRole="button"
          onPress={onPress}
          style={({ pressed }) => [
            styles.button(fill),
            pressed && styles.pressed,
          ]}
        >
          <AppIcon color={onFill} name={content.icon} size={28} />
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create((theme) => ({
  wrap: (bottomOffset: number) => ({
    position: "absolute",
    right: theme.spacing[4],
    bottom: bottomOffset,
  }),
  halo: (backgroundColor: string) => ({
    width: 68,
    height: 68,
    borderRadius: theme.radius.circle,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor,
    borderWidth: 1,
    borderColor: backgroundColor,
  }),
  button: (backgroundColor: string) => ({
    ...theme.shadows.floating,
    width: 56,
    height: 56,
    borderRadius: theme.radius.circle,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor,
    borderWidth: 4,
    borderColor: theme.colors.surface,
    shadowColor: backgroundColor,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 18,
    elevation: 8,
  }),
  pressed: {
    opacity: 0.85,
  },
}));
