import React from "react";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

import type { ActivityMetricDto } from "@stepwhere/types";

import { ActivityMetricRing } from "./activity-metric-ring";

type ActivityMetricRingsProps = {
  metrics: ActivityMetricDto[];
};

const ICONS = {
  activeTime: "clock" as const,
  calories: "flash" as const,
  steps: "activity" as const,
};

export function ActivityMetricRings({ metrics }: ActivityMetricRingsProps) {
  return (
    <View style={styles.card}>
      {metrics.map((metric) => (
        <ActivityMetricRing icon={ICONS[metric.key]} key={metric.key} metric={metric} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  card: {
    marginTop: theme.spacing[4],
    marginHorizontal: theme.spacing[5],
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[4],
    borderRadius: theme.radius.card,
    borderWidth: 1,
    borderColor: theme.colors.chrome.cardBorder,
    backgroundColor: theme.colors.surface,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: theme.spacing[2],
    ...theme.shadows.card,
  },
}));
