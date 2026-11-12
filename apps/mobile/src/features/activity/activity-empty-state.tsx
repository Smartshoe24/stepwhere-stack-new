import React from "react";
import { Pressable, Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

import { AppIcon, type AppIconName } from "@/components/ui/app-icon";

type ActivityEmptyStateProps = {
  action?: { label: string; onPress: () => void };
  body?: string;
  icon?: AppIconName;
  title?: string;
};

/**
 * Covers both "no child connected" and "child connected but nothing recorded".
 * With stub data every range had numbers, so the second case was never visible;
 * against live data a newly bound tracker hits it immediately.
 */
export function ActivityEmptyState({
  action,
  body = "Add a child to view activity insights.",
  icon = "children",
  title = "No child is connected yet",
}: ActivityEmptyStateProps) {
  return (
    <View style={styles.container}>
      <View style={styles.iconTile}>
        <AppIcon color={styles.iconGlyph.color} name={icon} size={26} />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{body}</Text>
      {action ? (
        <Pressable
          accessibilityRole="button"
          onPress={action.onPress}
          style={({ pressed }) => [styles.action, pressed && styles.pressed]}
        >
          <Text style={styles.actionLabel}>{action.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    marginTop: theme.spacing[6],
    marginHorizontal: theme.spacing[5],
    padding: theme.spacing[6],
    borderRadius: theme.radius.card,
    borderWidth: 1,
    borderColor: theme.colors.chrome.cardBorder,
    backgroundColor: theme.colors.surface,
    gap: theme.spacing[2],
    ...theme.shadows.card,
  },
  iconTile: {
    width: 44,
    height: 44,
    borderRadius: theme.radius.cardSmall,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: theme.spacing[1],
    backgroundColor: theme.colors.surfaceMuted,
  },
  iconGlyph: {
    color: theme.colors.textMuted,
  },
  title: {
    color: theme.colors.text,
    fontFamily: theme.typography.family.display,
    fontSize: 20,
    fontWeight: theme.typography.weight.semibold,
  },
  body: {
    color: theme.colors.textSecondary,
    fontFamily: theme.typography.family.body,
    fontSize: theme.typography.size.body,
    lineHeight: 20,
  },
  action: {
    alignSelf: "flex-start",
    minHeight: 42,
    justifyContent: "center",
    marginTop: theme.spacing[2],
    paddingHorizontal: theme.spacing[4],
    borderRadius: theme.radius.button,
    borderWidth: 1,
    borderColor: theme.colors.chrome.cardBorder,
    backgroundColor: theme.colors.surface,
  },
  actionLabel: {
    color: theme.colors.text,
    fontFamily: theme.typography.family.body,
    fontSize: 13,
    fontWeight: theme.typography.weight.semibold,
  },
  pressed: {
    opacity: theme.colors.button.pressedOpacity,
  },
}));
