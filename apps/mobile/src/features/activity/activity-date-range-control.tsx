import React from "react";
import { Pressable, Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

import { IconButton } from "@/components/ui/icon-button";

type ActivityDateRangeControlProps = {
  canGoNext: boolean;
  label: string;
  onNext: () => void;
  onOpenSheet: () => void;
  onPrevious: () => void;
};

export function ActivityDateRangeControl({
  canGoNext,
  label,
  onNext,
  onOpenSheet,
  onPrevious,
}: ActivityDateRangeControlProps) {
  return (
    <View style={styles.container}>
      <IconButton accessibilityLabel="Previous period" icon="chevron-left" onPress={onPrevious} />
      <Pressable accessibilityRole="button" onPress={onOpenSheet} style={({ pressed }) => [styles.center, pressed && styles.pressed]}>
        <Text numberOfLines={1} style={styles.label}>{label}</Text>
      </Pressable>
      <IconButton accessibilityLabel="Next period" disabled={!canGoNext} icon="chevron-right" onPress={onNext} />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    marginTop: theme.spacing[4],
    marginHorizontal: theme.spacing[5],
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[3],
  },
  center: {
    flex: 1,
    minHeight: 52,
    borderRadius: theme.radius.button,
    borderWidth: 1,
    borderColor: theme.colors.chrome.cardBorder,
    backgroundColor: theme.colors.surface,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: theme.spacing[4],
    ...theme.shadows.card,
  },
  label: {
    color: theme.colors.text,
    fontFamily: theme.typography.family.body,
    fontSize: 16,
    fontWeight: theme.typography.weight.semibold,
  },
  pressed: {
    opacity: theme.colors.button.pressedOpacity,
  },
}));
