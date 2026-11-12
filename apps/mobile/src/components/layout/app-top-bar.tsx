import React from "react";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import Animated, {
  useAnimatedStyle,
  withTiming,
} from "react-native-reanimated";

import type { ThemeToggleOrigin } from "@/components/icons/animated/animated-theme-toggle";
import { AnimatedThemeToggle } from "@/components/icons/animated/animated-theme-toggle";
import { StepwhereLogo } from "@/components/home/stepwhere-logo";
import { Badge } from "@/components/ui/badge";
import { IconButton } from "@/components/ui/icon-button";

export type AppTopBarSecondaryAction =
  | {
      kind: "bell";
      badgeLabel?: string;
      onPress?: () => void;
    }
  | {
      kind: "collapse";
      onPress: () => void;
    }
  | {
      kind: "none";
    };

export type AppTopBarProps = {
  animateThemeIcon?: boolean;
  chromeHidden?: boolean;
  onThemeTogglePress: (origin: ThemeToggleOrigin) => void;
  secondaryAction: AppTopBarSecondaryAction;
  themeName: "light" | "dark";
  themeToggleDisabled?: boolean;
};

export function AppTopBar({
  animateThemeIcon = true,
  chromeHidden = false,
  onThemeTogglePress,
  secondaryAction,
  themeName,
  themeToggleDisabled = false,
}: AppTopBarProps) {
  const actionsStyle = useAnimatedStyle(
    () => ({
      opacity: withTiming(chromeHidden ? 0 : 1, { duration: 180 }),
      transform: [
        { translateY: withTiming(chromeHidden ? -8 : 0, { duration: 180 }) },
      ],
    }),
    [chromeHidden],
  );

  return (
    <View style={styles.container}>
      <View style={styles.brandWrap}>
        <StepwhereLogo height={16} />
      </View>
      <Animated.View
        pointerEvents={chromeHidden ? "none" : "auto"}
        style={[styles.actions, actionsStyle]}
      >
        <AnimatedThemeToggle
          animateIcon={animateThemeIcon}
          disabled={themeToggleDisabled}
          onPress={onThemeTogglePress}
          themeName={themeName}
        />
        {secondaryAction.kind === "bell" ? (
          <View>
            <IconButton
              accessibilityLabel="Open notifications"
              icon="bell"
              size={38}
              onPress={secondaryAction.onPress}
            />
            {secondaryAction.badgeLabel ? (
              <View style={styles.badgeWrap}>
                <Badge label={secondaryAction.badgeLabel} />
              </View>
            ) : null}
          </View>
        ) : null}
        {secondaryAction.kind === "collapse" ? (
          <IconButton
            accessibilityLabel="Collapse map"
            icon="chevron-down"
            onPress={secondaryAction.onPress}
          />
        ) : null}
        {secondaryAction.kind === "none" ? (
          <View style={styles.actionSpacer} />
        ) : null}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: theme.spacing[6],
    paddingBottom: theme.spacing[1],
  },
  brandWrap: {
    minWidth: 0,
    flexShrink: 1,
    marginRight: theme.spacing[3],
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[3],
  },
  badgeWrap: {
    position: "absolute",
    top: -2,
    right: -2,
  },
  actionSpacer: {
    width: 44,
    height: 44,
  },
}));
