import { BlurView } from "expo-blur";
import React from "react";
import { Pressable, Text, View, type View as NativeView } from "react-native";
import Animated, {
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import { ShoeHelpSheet } from "@/components/home/shoe-help-sheet";
import { AppIcon } from "@/components/ui/app-icon";
import {
  FIRST_CONNECTION_EXPECTED_MINUTES,
  FIRST_CONNECTION_EXPECTED_MS,
} from "@/features/overview/shoe-connection";

type FirstLocationGateProps = {
  blurTarget: React.RefObject<NativeView | null>;
  childId: string;
  childName: string;
  gsmConnected: boolean;
  locationReceived: boolean;
  /** The shoe has never sent a report, so it is most likely not charged. */
  neverConnected?: boolean;
  onVisibilityChange?: (visible: boolean) => void;
  protectedTopOffset?: number;
  topInset?: number;
};

type LocationStatusRowProps = {
  complete: boolean;
  label: string;
};

const SIMULTANEOUS_STEP_DELAY_MS = 180;
const COMPLETION_HOLD_MS = 500;
const OVERLAY_EXIT_MS = 180;
const REDUCED_MOTION_HOLD_MS = 240;
const REDUCED_MOTION_EXIT_MS = 120;

export function FirstLocationGate({
  blurTarget,
  childId,
  childName,
  gsmConnected,
  locationReceived,
  neverConnected = false,
  onVisibilityChange,
  protectedTopOffset = 0,
  topInset = 0,
}: FirstLocationGateProps) {
  const { rt } = useUnistyles();
  const reduceMotion = useReducedMotion();
  const [visible, setVisible] = React.useState(() => !locationReceived);
  const [shoeComplete, setShoeComplete] = React.useState(false);
  const [locationComplete, setLocationComplete] = React.useState(false);
  const shoeCompleteRef = React.useRef(false);
  const exitStartedRef = React.useRef(false);
  const timersRef = React.useRef<ReturnType<typeof setTimeout>[]>([]);
  const overlayOpacity = useSharedValue(1);
  const [isHelpVisible, setIsHelpVisible] = React.useState(false);
  const [stillWaiting, setStillWaiting] = React.useState(false);
  const firstName = childName.trim().split(/\s+/)[0] || childName;
  const blurTint = rt.themeName === "dark" ? "dark" : "light";

  React.useEffect(() => {
    if (!visible) {
      return;
    }

    const gsmJustCompleted = gsmConnected && !shoeCompleteRef.current;

    if (gsmJustCompleted) {
      shoeCompleteRef.current = true;
      setShoeComplete(true);
    }

    if (!gsmConnected || !locationReceived || exitStartedRef.current) {
      return;
    }

    exitStartedRef.current = true;
    const stepDelay = reduceMotion
      ? 0
      : gsmJustCompleted
        ? SIMULTANEOUS_STEP_DELAY_MS
        : 0;
    const holdDuration = reduceMotion
      ? REDUCED_MOTION_HOLD_MS
      : COMPLETION_HOLD_MS;
    const exitDuration = reduceMotion
      ? REDUCED_MOTION_EXIT_MS
      : OVERLAY_EXIT_MS;

    timersRef.current.push(
      setTimeout(() => {
        setLocationComplete(true);
      }, stepDelay),
      setTimeout(() => {
        overlayOpacity.value = withTiming(
          0,
          { duration: exitDuration },
          (finished) => {
            if (finished) {
              runOnJS(setVisible)(false);
            }
          },
        );
      }, stepDelay + holdDuration),
    );
  }, [gsmConnected, locationReceived, overlayOpacity, reduceMotion, visible]);

  // After the time a first connection normally takes, say more than "wait".
  React.useEffect(() => {
    if (!neverConnected) {
      setStillWaiting(false);
      return;
    }

    const timer = setTimeout(() => setStillWaiting(true), FIRST_CONNECTION_EXPECTED_MS);

    return () => clearTimeout(timer);
  }, [neverConnected]);

  React.useEffect(
    () => () => {
      for (const timer of timersRef.current) {
        clearTimeout(timer);
      }
      timersRef.current = [];
    },
    [],
  );

  React.useEffect(() => {
    onVisibilityChange?.(visible);

    return () => {
      if (visible) {
        onVisibilityChange?.(false);
      }
    };
  }, [onVisibilityChange, visible]);

  const overlayStyle = useAnimatedStyle(() => ({
    opacity: overlayOpacity.value,
  }));

  if (!visible) {
    return null;
  }

  return (
    <Animated.View
      accessibilityViewIsModal
      key={childId}
      style={[styles.overlay(topInset), overlayStyle]}
    >
      <BlurView
        blurMethod="dimezisBlurViewSdk31Plus"
        blurTarget={blurTarget}
        intensity={58}
        pointerEvents="none"
        style={styles.backdrop}
        tint={blurTint}
      />
      <View style={styles.cardRegion(protectedTopOffset)}>
        {neverConnected ? (
          <View style={styles.card}>
            <Text style={styles.title}>{`Waiting for ${firstName}'s shoe`}</Text>
            <Text style={styles.body}>
              The shoe hasn't connected yet. New shoes usually need to be charged first.
            </Text>
            <View style={styles.checklist}>
              <ChecklistRow index={1} label="Charge the shoe fully" />
              <ChecklistRow index={2} label="Take it outside or near a window" />
            </View>
            <Text style={styles.note}>
              {stillWaiting
                ? "Still not connected? Make sure the shoe is fully charged and give it a few more minutes. If that doesn't help, contact support."
                : `The first connection can take 10 to ${FIRST_CONNECTION_EXPECTED_MINUTES} minutes.`}
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => setIsHelpVisible(true)}
              style={({ pressed }) => [styles.helpButton, pressed && styles.pressed]}>
              <Text style={styles.helpLabel}>Why isn't it connecting?</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.title}>
              {`Getting ${firstName}'s location ready`}
            </Text>
            <View style={styles.steps}>
              <LocationStatusRow
                complete={shoeComplete}
                label="Shoe connected"
              />
              <View
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                style={styles.connector(shoeComplete)}
              />
              <LocationStatusRow
                complete={locationComplete}
                label="Live location received"
              />
            </View>
          </View>
        )}
      </View>
      <ShoeHelpSheet onClose={() => setIsHelpVisible(false)} visible={isHelpVisible} />
    </Animated.View>
  );
}

function ChecklistRow({ index, label }: { index: number; label: string }) {
  return (
    <View style={styles.checklistRow}>
      <View style={styles.checklistNumber}>
        <Text style={styles.checklistNumberText}>{index}</Text>
      </View>
      <Text style={styles.checklistLabel}>{label}</Text>
    </View>
  );
}

function LocationStatusRow({ complete, label }: LocationStatusRowProps) {
  const reduceMotion = useReducedMotion();
  const scale = useSharedValue(1);
  const pendingOpacity = useSharedValue(1);

  React.useEffect(() => {
    if (complete) {
      cancelAnimation(pendingOpacity);
      pendingOpacity.value = 1;

      if (reduceMotion) {
        scale.value = 1;
        return;
      }

      scale.value = 0.82;
      scale.value = withSpring(1, {
        damping: 15,
        mass: 0.7,
        stiffness: 220,
      });
      return;
    }

    scale.value = 1;
    pendingOpacity.value = reduceMotion
      ? 1
      : withRepeat(withTiming(0.42, { duration: 720 }), -1, true);

    return () => {
      cancelAnimation(pendingOpacity);
    };
  }, [complete, pendingOpacity, reduceMotion, scale]);

  const circleStyle = useAnimatedStyle(() => ({
    opacity: complete ? 1 : pendingOpacity.value,
    transform: [{ scale: scale.value }],
  }));

  return (
    <View
      accessibilityLabel={`${label}, ${complete ? "complete" : "pending"}`}
      accessibilityLiveRegion="polite"
      accessibilityRole="text"
      style={styles.statusRow}
    >
      <Animated.View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[styles.statusCircle(complete), circleStyle]}
      >
        {complete ? (
          <AppIcon color={styles.checkIcon.color} name="check" size={15} />
        ) : (
          <View style={styles.pendingDot} />
        )}
      </Animated.View>
      <Text style={styles.statusLabel(complete)}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  overlay: (topInset: number) => ({
    position: "absolute",
    top: -topInset,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 40,
  }),
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: theme.colors.shadowStrong,
  },
  cardRegion: (protectedTopOffset: number) => ({
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: protectedTopOffset + theme.spacing[5],
    paddingRight: theme.spacing[5],
    paddingBottom: theme.spacing[5],
    paddingLeft: theme.spacing[5],
  }),
  card: {
    width: "88%",
    maxWidth: 320,
    borderRadius: theme.radius.card,
    borderWidth: 1,
    borderColor: theme.colors.chrome.cardBorder,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: theme.spacing[5],
    paddingVertical: theme.spacing[5],
    ...theme.shadows.floating,
  },
  title: {
    color: theme.colors.text,
    textAlign: "center",
    fontFamily: theme.typography.family.display,
    fontSize: 18,
    lineHeight: 23,
    fontWeight: theme.typography.weight.semibold,
  },
  steps: {
    marginTop: theme.spacing[4],
  },
  body: {
    marginTop: theme.spacing[2],
    color: theme.colors.textSecondary,
    textAlign: "center",
    fontFamily: theme.typography.family.body,
    fontSize: 13,
    lineHeight: 18,
  },
  checklist: {
    marginTop: theme.spacing[4],
    gap: theme.spacing[3],
  },
  checklistRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[3],
  },
  checklistNumber: {
    width: 26,
    height: 26,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.radius.circle,
    borderWidth: 1,
    borderColor: theme.colors.chrome.cardBorder,
    backgroundColor: theme.colors.surfaceMuted,
  },
  checklistNumberText: {
    color: theme.colors.text,
    fontFamily: theme.typography.family.body,
    fontSize: 13,
    lineHeight: 16,
    fontWeight: theme.typography.weight.semibold,
  },
  checklistLabel: {
    flex: 1,
    color: theme.colors.text,
    fontFamily: theme.typography.family.body,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: theme.typography.weight.medium,
  },
  note: {
    marginTop: theme.spacing[4],
    color: theme.colors.textSecondary,
    textAlign: "center",
    fontFamily: theme.typography.family.body,
    fontSize: 12,
    lineHeight: 17,
  },
  helpButton: {
    marginTop: theme.spacing[3],
    alignSelf: "center",
    paddingVertical: theme.spacing[1],
  },
  helpLabel: {
    color: theme.colors.primaryGreen,
    fontFamily: theme.typography.family.body,
    fontSize: 13,
    lineHeight: 16,
    fontWeight: theme.typography.weight.semibold,
  },
  pressed: {
    opacity: theme.colors.button.pressedOpacity,
  },
  statusRow: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[3],
  },
  statusCircle: (complete: boolean) => ({
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.radius.circle,
    borderWidth: complete ? 0 : 2,
    borderColor: theme.colors.textMuted,
    backgroundColor: complete
      ? theme.colors.primaryGreen
      : theme.colors.surface,
  }),
  checkIcon: {
    color: theme.colors.badgeText,
  },
  pendingDot: {
    width: 6,
    height: 6,
    borderRadius: theme.radius.circle,
    backgroundColor: theme.colors.textMuted,
  },
  connector: (complete: boolean) => ({
    width: 2,
    height: 12,
    marginLeft: 13,
    borderRadius: theme.radius.circle,
    backgroundColor: complete
      ? theme.colors.primaryGreen
      : theme.colors.chrome.cardBorder,
  }),
  statusLabel: (complete: boolean) => ({
    flex: 1,
    color: complete ? theme.colors.text : theme.colors.textSecondary,
    fontFamily: theme.typography.family.body,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: complete
      ? theme.typography.weight.semibold
      : theme.typography.weight.medium,
  }),
}));
