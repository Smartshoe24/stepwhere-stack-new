import React from "react";
import { type LayoutChangeEvent, Pressable, Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  withTiming,
} from "react-native-reanimated";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import { AppIcon } from "@/components/ui/app-icon";
import {
  getGeofenceStatusDotTone,
  getGeofenceToneColors,
} from "@/components/home/geofence-presentation";
import {
  formatGeofenceRadiusForUnit,
  type GeofenceRadiusUnit,
  type GeofenceUiStatus,
} from "@/components/home/geofence-state";
import { StatusDot } from "@/components/ui/status-dot";

type GeofenceStatusCardProps = {
  bottomOffset: number;
  breachAction: "disable" | "reset";
  childName: string;
  chromeHidden?: boolean;
  onActionPress: () => void;
  onLayout?: (event: LayoutChangeEvent) => void;
  radiusMeters: number | null;
  radiusUnit: GeofenceRadiusUnit;
  status: Exclude<GeofenceUiStatus, "editing">;
};

const contentByStatus = {
  breached: {
    actionIcon: "target" as const,
    actionLabel: "Reset",
    body: (childName: string) => `${childName} left the safe zone.`,
    title: () => "Outside safe zone",
  },
  disabled: {
    actionIcon: "pencil" as const,
    actionLabel: "Edit",
    body: (childName: string) =>
      `You won't be notified if ${childName} leaves the safe zone.`,
    title: () => "Geofence is off",
  },
  enabled: {
    actionIcon: "pencil" as const,
    actionLabel: "Edit",
    body: (childName: string) =>
      `You'll be notified if ${childName} leaves the safe zone.`,
    title: () => "Geofence is on",
  },
  unset: {
    actionIcon: "pencil" as const,
    actionLabel: "Set now",
    body: (childName: string) =>
      `Set a safe zone to get alerts when ${childName} leaves that area.`,
    title: () => "No geofence set",
  },
} satisfies Record<
  Exclude<GeofenceUiStatus, "editing">,
  {
    actionIcon: React.ComponentProps<typeof AppIcon>["name"];
    actionLabel: string;
    body: (childName: string) => string;
    title: (childName: string) => string;
  }
>;

/**
 * State is signalled by a dot and a tinted radius pill, not by tinting the title.
 * Colored 13px title text was both shouty and the lowest-contrast element on the
 * card; the title is now plain `colors.text` and every state shares one skeleton,
 * so switching states no longer reflows the layout.
 */
export function GeofenceStatusCard({
  bottomOffset,
  breachAction,
  childName,
  chromeHidden = false,
  onActionPress,
  onLayout,
  radiusMeters,
  radiusUnit,
  status,
}: GeofenceStatusCardProps) {
  const { theme } = useUnistyles();
  const [measuredHeight, setMeasuredHeight] = React.useState(116);
  const content = contentByStatus[status];
  const tone = getGeofenceToneColors(theme, status);
  const isBreached = status === "breached";
  const animatedStyle = useAnimatedStyle(
    () => ({
      opacity: withTiming(chromeHidden ? 0 : 1, {
        duration: chromeHidden ? 220 : 190,
      }),
      transform: [
        {
          translateY: withTiming(
            chromeHidden ? bottomOffset + measuredHeight + 32 : 0,
            {
              duration: chromeHidden ? 220 : 190,
            },
          ),
        },
      ],
    }),
    [bottomOffset, chromeHidden, measuredHeight],
  );
  const radiusLabel =
    radiusMeters != null
      ? formatGeofenceRadiusForUnit(radiusMeters, radiusUnit)
      : null;
  const isResetUnavailable = isBreached && breachAction === "disable";
  const actionIcon = isResetUnavailable ? "shield-off" : content.actionIcon;
  const actionLabel = isResetUnavailable ? "Turn off" : content.actionLabel;
  const body = isResetUnavailable
    ? "Latest location is too old to reset. Turn off the safe zone until a new update arrives."
    : isBreached && radiusLabel
      ? `${childName} is outside the ${radiusLabel} safe zone.`
      : content.body(childName);

  function handleLayout(event: LayoutChangeEvent) {
    const nextHeight = Math.round(event.nativeEvent.layout.height);
    setMeasuredHeight((current) =>
      Math.abs(current - nextHeight) >= 1 ? nextHeight : current,
    );
    onLayout?.(event);
  }

  return (
    <Animated.View
      onLayout={handleLayout}
      pointerEvents={chromeHidden ? "none" : "auto"}
      style={[styles.container(isBreached), styles.position(bottomOffset), animatedStyle]}
    >
      <View style={styles.titleRow}>
        <StatusDot size={8} status={getGeofenceStatusDotTone(status)} />
        <Text numberOfLines={1} style={styles.title}>
          {content.title()}
        </Text>
        {radiusLabel ? (
          <View style={styles.radiusPill(tone.pillSurface)}>
            <Text style={styles.radiusText(tone.pillText)}>{radiusLabel}</Text>
          </View>
        ) : null}
      </View>

      <Text numberOfLines={2} style={styles.body}>
        {body}
      </Text>

      <Pressable
        accessibilityLabel={actionLabel}
        accessibilityRole="button"
        onPress={onActionPress}
        style={({ pressed }) => [
          styles.actionButton(isBreached ? tone.pillSurface : undefined),
          pressed && styles.pressed,
        ]}
      >
        <AppIcon
          color={isBreached ? tone.pillText : styles.actionIcon.color}
          name={actionIcon}
          size={15}
        />
        <Text style={styles.actionLabel(isBreached ? tone.pillText : undefined)}>
          {actionLabel}
        </Text>
        <AppIcon
          color={isBreached ? tone.pillText : styles.actionChevron.color}
          name="chevron-right"
          size={16}
        />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create((theme) => ({
  position: (bottomOffset: number) => ({
    bottom: bottomOffset,
  }),
  container: (isBreached: boolean) => ({
    position: "absolute",
    left: theme.spacing[4],
    right: theme.spacing[4],
    gap: theme.spacing[2],
    padding: theme.spacing[4],
    borderRadius: theme.radius.card,
    backgroundColor: isBreached
      ? theme.colors.geofence.breachedCard
      : theme.colors.surface,
    borderWidth: 1,
    borderColor: isBreached
      ? theme.colors.geofence.breachedCardBorder
      : theme.colors.chrome.cardBorder,
    ...theme.shadows.card,
  }),
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  title: {
    flex: 1,
    minWidth: 0,
    color: theme.colors.text,
    fontFamily: theme.typography.family.display,
    ...theme.typography.text.bodyLarge,
    fontWeight: theme.typography.weight.semibold,
  },
  radiusPill: (backgroundColor: string) => ({
    minHeight: 22,
    paddingHorizontal: theme.spacing[2],
    borderRadius: theme.radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor,
  }),
  radiusText: (color: string) => ({
    color,
    fontFamily: theme.typography.family.body,
    ...theme.typography.text.meta,
    ...theme.typography.tabular,
    fontWeight: theme.typography.weight.semibold,
  }),
  body: {
    color: theme.colors.textSecondary,
    fontFamily: theme.typography.family.body,
    ...theme.typography.text.meta,
  },
  // A real bordered control with a 40px hit target. Previously this was a bare
  // icon+label+chevron with no bounds, which did not read as a button.
  actionButton: (backgroundColor?: string) => ({
    alignSelf: "flex-start",
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1] + 2,
    marginTop: theme.spacing[1],
    paddingLeft: theme.spacing[3],
    paddingRight: theme.spacing[2],
    borderRadius: theme.radius.button,
    borderWidth: 1,
    borderColor: backgroundColor ? "transparent" : theme.colors.chrome.cardBorder,
    backgroundColor: backgroundColor ?? theme.colors.surface,
  }),
  actionIcon: {
    color: theme.colors.icon,
  },
  actionChevron: {
    color: theme.colors.textMuted,
  },
  actionLabel: (color?: string) => ({
    color: color ?? theme.colors.text,
    fontFamily: theme.typography.family.body,
    ...theme.typography.text.body,
    fontWeight: theme.typography.weight.semibold,
  }),
  pressed: {
    opacity: theme.colors.button.pressedOpacity,
  },
}));
