import React from "react";
import { type LayoutChangeEvent, Pressable, Text, View } from "react-native";
import Animated, {
  clamp,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import { AppIcon } from "@/components/ui/app-icon";
import { getGeofenceFillColors } from "@/components/home/geofence-presentation";
import { GeofenceRadiusSlider } from "@/components/home/geofence-radius-slider";
import {
  clampGeofenceRadius,
  formatGeofenceRadiusForUnit,
  GEOFENCE_RADIUS_LIMITS,
  type GeofenceRadiusUnit,
} from "@/components/home/geofence-state";

const SLIDER_THUMB_INSET = 14;
const RADIUS_BADGE_WIDTH = 68;
const RADIUS_BADGE_HEIGHT = 24;

type GeofenceRadiusEditorCardProps = {
  bottomOffset: number;
  chromeHidden?: boolean;
  /**
   * Live radius in meters, owned by `useGeofenceRadiusDrag` in the parent and
   * shared by the badge, slider, and map ring.
   */
  liveRadiusMeters: SharedValue<number>;
  onBackPress: () => void;
  onInteractionCancel: () => void;
  onInteractionEnd: () => void;
  onInteractionStart: () => void;
  onLayout?: (event: LayoutChangeEvent) => void;
  /** Wired straight to the slider; fires at pointer-move frequency. */
  onSliderValueChange: (value: number) => void;
  onUnitChange: (unit: GeofenceRadiusUnit) => void;
  radiusMeters: number;
  radiusUnit: GeofenceRadiusUnit;
};

export function GeofenceRadiusEditorCard({
  bottomOffset,
  chromeHidden = false,
  liveRadiusMeters,
  onBackPress,
  onInteractionCancel,
  onInteractionEnd,
  onInteractionStart,
  onLayout,
  onSliderValueChange,
  onUnitChange,
  radiusMeters,
  radiusUnit,
}: GeofenceRadiusEditorCardProps) {
  const { theme } = useUnistyles();
  const editingFill = getGeofenceFillColors(theme, "editing");
  const [measuredHeight, setMeasuredHeight] = React.useState(104);
  const [sliderWidth, setSliderWidth] = React.useState(0);
  const limits = GEOFENCE_RADIUS_LIMITS[radiusUnit];
  const safeRadius = clampGeofenceRadius(radiusMeters, radiusUnit);
  const usableWidth = Math.max(sliderWidth - SLIDER_THUMB_INSET * 2, 0);

  function handleLayout(event: LayoutChangeEvent) {
    const nextHeight = Math.round(event.nativeEvent.layout.height);
    setMeasuredHeight((current) =>
      Math.abs(current - nextHeight) >= 1 ? nextHeight : current,
    );
    onLayout?.(event);
  }

  function handleSliderAreaLayout(event: LayoutChangeEvent) {
    const nextWidth = Math.round(event.nativeEvent.layout.width);
    setSliderWidth((current) =>
      Math.abs(current - nextWidth) >= 1 ? nextWidth : current,
    );
  }

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

  /**
   * Badge tracks the thumb on the UI thread, so a drag costs no render here.
   *
   * `clamp` comes from Reanimated because it carries a `'worklet'` directive. A
   * hand-rolled local helper would be captured into this worklet's closure as a
   * plain function and throw at runtime — the Babel plugin captures same-module
   * functions exactly like imports, it does not inline them.
   */
  const badgeStyle = useAnimatedStyle(() => {
    if (sliderWidth <= 0) {
      return { transform: [{ translateX: 0 }] };
    }

    const progress = clamp(
      (liveRadiusMeters.get() - limits.minMeters)
        / Math.max(limits.maxMeters - limits.minMeters, 1),
      0,
      1,
    );
    const rawCenterX = SLIDER_THUMB_INSET + progress * usableWidth;
    const centerX = clamp(
      rawCenterX,
      RADIUS_BADGE_WIDTH / 2,
      Math.max(sliderWidth - RADIUS_BADGE_WIDTH / 2, RADIUS_BADGE_WIDTH / 2),
    );

    return { transform: [{ translateX: centerX - RADIUS_BADGE_WIDTH / 2 }] };
  }, [limits.maxMeters, limits.minMeters, sliderWidth, usableWidth]);

  return (
    <Animated.View
      onLayout={handleLayout}
      pointerEvents={chromeHidden ? "none" : "auto"}
      style={[styles.container(bottomOffset), animatedStyle]}
    >
      <View style={styles.headerRow}>
        <Pressable
          accessibilityLabel="Exit geofence editing"
          accessibilityRole="button"
          onPress={onBackPress}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
        >
          <AppIcon color={styles.backIcon.color} name="chevron-left" size={16} />
          <Text style={styles.backLabel}>Back</Text>
        </Pressable>

        <View style={styles.unitToggle}>
          <UnitSegment
            activeBackgroundColor={editingFill.fill}
            activeTextColor={editingFill.onFill}
            isActive={radiusUnit === "m"}
            label="m"
            onPress={() => onUnitChange("m")}
          />
          <UnitSegment
            activeBackgroundColor={editingFill.fill}
            activeTextColor={editingFill.onFill}
            isActive={radiusUnit === "km"}
            label="km"
            onPress={() => onUnitChange("km")}
          />
        </View>
      </View>

      <View onLayout={handleSliderAreaLayout} style={styles.sliderArea}>
        <Animated.View pointerEvents="none" style={[styles.badgeWrap, badgeStyle]}>
          <View style={styles.badge(editingFill.fill)}>
            <RadiusBadgeLabel
              initialRadiusMeters={safeRadius}
              liveRadiusMeters={liveRadiusMeters}
              textColor={editingFill.onFill}
              unit={radiusUnit}
            />
          </View>
          <View style={styles.badgePointer(editingFill.fill)} />
        </Animated.View>
        <View style={styles.sliderTrackWrap}>
          <GeofenceRadiusSlider
            activeTrackColor={editingFill.fill}
            inactiveTrackColor={theme.colors.geofence.sliderTrack}
            liveValue={liveRadiusMeters}
            maximumValue={limits.maxMeters}
            minimumValue={limits.minMeters}
            onInteractionCancel={onInteractionCancel}
            onInteractionEnd={onInteractionEnd}
            onInteractionStart={onInteractionStart}
            onValueChange={onSliderValueChange}
            step={limits.stepMeters}
            style={styles.slider}
            thumbColor={editingFill.fill}
            value={safeRadius}
          />
        </View>
      </View>

      <View style={styles.rangeRow}>
        <Text style={styles.rangeLabel}>{limits.minLabel}</Text>
        <Text style={styles.rangeLabel}>{limits.maxLabel}</Text>
      </View>
    </Animated.View>
  );
}

function UnitSegment({
  activeBackgroundColor,
  activeTextColor,
  isActive,
  label,
  onPress,
}: {
  activeBackgroundColor: string;
  activeTextColor: string;
  isActive: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={label === "m" ? "Use meters" : "Use kilometers"}
      accessibilityRole="button"
      accessibilityState={{ selected: isActive }}
      onPress={onPress}
      style={[
        styles.unitSegment,
        isActive && styles.unitSegmentActive(activeBackgroundColor),
      ]}
    >
      <Text style={isActive ? styles.unitLabelActive(activeTextColor) : styles.unitLabel}>
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * Shows the live value without re-rendering the card on every frame. Reanimated
 * cannot drive `Text` children directly, so this watches the shared value and
 * only crosses to JS when it changes — once per step, not once per pointer frame
 * (the slider snaps to steps, so repeated same-value frames dedupe here).
 *
 * The reaction body deliberately does nothing but read a number. Worklets are not
 * followed into imports, so calling `formatGeofenceRadiusForUnit` here would try
 * to invoke a non-worklet on the UI thread and throw. Formatting stays on the JS
 * thread, during render.
 */
function RadiusBadgeLabel({
  initialRadiusMeters,
  liveRadiusMeters,
  textColor,
  unit,
}: {
  initialRadiusMeters: number;
  liveRadiusMeters: SharedValue<number>;
  textColor: string;
  unit: GeofenceRadiusUnit;
}) {
  const [radiusMeters, setRadiusMeters] = React.useState(initialRadiusMeters);

  useAnimatedReaction(
    () => liveRadiusMeters.get(),
    (next, previous) => {
      if (next !== previous) {
        runOnJS(setRadiusMeters)(next);
      }
    },
  );

  return (
    <Text style={styles.badgeText(textColor)}>
      {formatGeofenceRadiusForUnit(radiusMeters, unit)}
    </Text>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: (bottomOffset: number) => ({
    position: "absolute",
    left: theme.spacing[4],
    right: theme.spacing[4],
    bottom: bottomOffset,
    minHeight: 104,
    paddingHorizontal: theme.spacing[4],
    paddingTop: theme.spacing[2],
    paddingBottom: theme.spacing[2],
    borderRadius: theme.radius.card,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.chrome.cardBorder,
    ...theme.shadows.card,
  }),
  headerRow: {
    minHeight: 32,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  backButton: {
    minHeight: 32,
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  backLabel: {
    color: theme.colors.text,
    fontFamily: theme.typography.family.body,
    ...theme.typography.text.meta,
    fontWeight: theme.typography.weight.medium,
  },
  backIcon: {
    color: theme.colors.text,
  },
  unitToggle: {
    height: 24,
    flexDirection: "row",
    padding: 2,
    borderRadius: theme.radius.circle,
    backgroundColor: theme.colors.surfaceMuted,
    borderWidth: 1,
    borderColor: theme.colors.chrome.cardBorder,
  },
  unitSegment: {
    minWidth: 36,
    height: 18,
    borderRadius: theme.radius.circle,
    alignItems: "center",
    justifyContent: "center",
  },
  unitSegmentActive: (backgroundColor: string) => ({
    backgroundColor,
  }),
  unitLabel: {
    color: theme.colors.textSecondary,
    fontFamily: theme.typography.family.body,
    ...theme.typography.text.caption,
    fontWeight: theme.typography.weight.medium,
  },
  unitLabelActive: (color: string) => ({
    color,
    fontFamily: theme.typography.family.body,
    ...theme.typography.text.caption,
    fontWeight: theme.typography.weight.semibold,
  }),
  sliderArea: {
    marginTop: theme.spacing[2],
    minHeight: 60,
    justifyContent: "flex-end",
  },
  badgeWrap: {
    position: "absolute",
    top: 0,
    left: 0,
    width: RADIUS_BADGE_WIDTH,
    height: 28,
    alignItems: "center",
  },
  badge: (backgroundColor: string) => ({
    width: RADIUS_BADGE_WIDTH,
    height: RADIUS_BADGE_HEIGHT,
    borderRadius: theme.radius.circle,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor,
  }),
  badgeText: (color: string) => ({
    color,
    fontFamily: theme.typography.family.display,
    ...theme.typography.text.meta,
    ...theme.typography.tabular,
    fontWeight: theme.typography.weight.semibold,
    textAlign: "center",
  }),
  badgePointer: (borderTopColor: string) => ({
    marginTop: -1,
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderTopWidth: 6,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderTopColor,
  }),
  sliderTrackWrap: {
    marginTop: 28,
    minHeight: 32,
    justifyContent: "center",
  },
  slider: {
    width: "100%",
    height: 34,
  },
  rangeRow: {
    marginTop: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  pressed: {
    opacity: theme.colors.button.pressedOpacity,
  },
  rangeLabel: {
    color: theme.colors.textSecondary,
    fontFamily: theme.typography.family.body,
    ...theme.typography.text.overline,
    ...theme.typography.tabular,
    letterSpacing: 0,
    fontWeight: theme.typography.weight.medium,
  },
}));
