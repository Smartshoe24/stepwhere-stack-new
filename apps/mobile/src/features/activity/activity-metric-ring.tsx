import React from "react";
import { Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import type { ActivityMetricDto } from "@stepwhere/types";

import { AppIcon } from "@/components/ui/app-icon";

import { ACTIVITY_UI } from "./activity-constants";

type ActivityMetricRingProps = {
  icon: React.ComponentProps<typeof AppIcon>["name"];
  metric: ActivityMetricDto;
};

function getToneColor(metric: ActivityMetricDto, theme: any) {
  if (metric.tone === "green") {
    return theme.colors.primaryGreen;
  }

  if (metric.tone === "blue") {
    return "#2563EB";
  }

  return "#F97316";
}

export function ActivityMetricRing({ icon, metric }: ActivityMetricRingProps) {
  const { theme } = useUnistyles();
  const size = ACTIVITY_UI.ringSize;
  const strokeWidth = ACTIVITY_UI.ringStrokeWidth;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progressPercent = Math.max(0, Math.min(metric.percentOfGoal, 150));
  const progressLength = (progressPercent / 150) * circumference;
  const toneColor = getToneColor(metric, theme);

  return (
    <View style={styles.container}>
      <View style={styles.ringWrap}>
        <Svg height={size} width={size}>
          <Circle
            cx={size / 2}
            cy={size / 2}
            fill="transparent"
            r={radius}
            stroke={theme.colors.surfaceMuted}
            strokeWidth={strokeWidth}
          />
          <Circle
            cx={size / 2}
            cy={size / 2}
            fill="transparent"
            r={radius}
            stroke={toneColor}
            strokeDasharray={`${progressLength} ${Math.max(circumference - progressLength, 0.001)}`}
            strokeLinecap="round"
            strokeWidth={strokeWidth}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        </Svg>
        <View style={styles.centerContent}>
          <AppIcon color={toneColor} name={icon} size={18} />
          <Text numberOfLines={1} style={styles.value}>{metric.formattedValue}</Text>
          <Text style={styles.label}>{metric.label}</Text>
        </View>
      </View>
      <Text numberOfLines={1} style={styles.goal}>{metric.formattedGoal}</Text>
      <View style={styles.badge(toneColor)}>
        <Text style={styles.badgeLabel}>{metric.percentOfGoal}%</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
    alignItems: "center",
    gap: theme.spacing[2],
  },
  ringWrap: {
    width: ACTIVITY_UI.ringSize,
    height: ACTIVITY_UI.ringSize,
    alignItems: "center",
    justifyContent: "center",
  },
  centerContent: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    paddingHorizontal: 8,
  },
  value: {
    color: theme.colors.text,
    fontFamily: theme.typography.family.display,
    fontSize: 18,
    lineHeight: 22,
    fontWeight: theme.typography.weight.bold,
  },
  label: {
    color: theme.colors.textSecondary,
    fontFamily: theme.typography.family.body,
    fontSize: 12,
    textAlign: "center",
  },
  goal: {
    color: theme.colors.textSecondary,
    fontFamily: theme.typography.family.body,
    fontSize: 12,
    textAlign: "center",
  },
  badge: (color: string) => ({
    minWidth: 50,
    paddingHorizontal: theme.spacing[2],
    minHeight: 24,
    borderRadius: theme.radius.circle,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: color,
  }),
  badgeLabel: {
    color: "#FFFFFF",
    fontFamily: theme.typography.family.body,
    fontSize: 12,
    fontWeight: theme.typography.weight.semibold,
  },
}));
