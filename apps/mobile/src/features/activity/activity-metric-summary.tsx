import React from "react";
import { Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import type { ActivityMetricDto } from "@stepwhere/types";

import { AppIcon } from "@/components/ui/app-icon";

type ActivityMetricSummaryProps = {
  metrics: ActivityMetricDto[];
};

type MetricDonutProps = {
  metric: ActivityMetricDto;
};

function getMetricTone(metric: ActivityMetricDto, theme: any) {
  switch (metric.key) {
    case "steps":
      return theme.colors.primaryGreen;
    case "activeTime":
      return "#2563EB";
    case "calories":
      return "#F97316";
  }
}

function getMetricIcon(metric: ActivityMetricDto) {
  switch (metric.key) {
    case "steps":
      return "activity" as const;
    case "activeTime":
      return "clock" as const;
    case "calories":
      return "flash" as const;
  }
}

function getCircularProgress(metric: ActivityMetricDto) {
  return Math.max(0, Math.min(metric.percentOfGoal, 100));
}

function getOrderedMetrics(metrics: ActivityMetricDto[]) {
  const order = ["steps", "activeTime", "calories"] as const;
  return order
    .map((key) => metrics.find((metric) => metric.key === key))
    .filter((metric): metric is ActivityMetricDto => Boolean(metric));
}

function MetricDonut({ metric }: MetricDonutProps) {
  const { theme } = useUnistyles();
  const size = 92;
  const strokeWidth = 5.5;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progressLength = (getCircularProgress(metric) / 100) * circumference;
  const toneColor = getMetricTone(metric, theme);

  return (
    <View style={styles.metricColumn}>
      <View style={styles.donutWrap(size)}>
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
        <View style={styles.donutCenter}>
          <AppIcon color={toneColor} name={getMetricIcon(metric)} size={15} />
          <Text
            adjustsFontSizeToFit
            minimumFontScale={0.72}
            numberOfLines={1}
            style={styles.metricValue}
          >
            {metric.formattedValue}
          </Text>
        </View>
      </View>

      <Text numberOfLines={1} style={styles.metricLabel}>
        {metric.label}
      </Text>
      <Text
        adjustsFontSizeToFit
        minimumFontScale={0.76}
        numberOfLines={1}
        style={styles.goalText}
      >
        {metric.formattedGoal}
      </Text>
      <View style={styles.badge(toneColor)}>
        <Text style={styles.badgeLabel}>{metric.percentOfGoal}%</Text>
      </View>
    </View>
  );
}

export function ActivityMetricSummary({ metrics }: ActivityMetricSummaryProps) {
  const orderedMetrics = getOrderedMetrics(metrics);

  if (orderedMetrics.length === 0) {
    return null;
  }

  return (
    <View style={styles.card}>
      <View style={styles.metricsRow}>
        {orderedMetrics.map((metric) => (
          <MetricDonut key={metric.key} metric={metric} />
        ))}
      </View>
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
    ...theme.shadows.card,
  },
  metricsRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    columnGap: theme.spacing[3],
  },
  metricColumn: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    gap: theme.spacing[2],
  },
  donutWrap: (size: number) => ({
    width: size,
    height: size,
    alignItems: "center",
    justifyContent: "center",
  }),
  donutCenter: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
    gap: 1,
    paddingHorizontal: 8,
  },
  metricValue: {
    maxWidth: 68,
    color: theme.colors.text,
    fontFamily: theme.typography.family.display,
    fontSize: 15,
    lineHeight: 18,
    fontWeight: theme.typography.weight.bold,
    textAlign: "center",
  },
  metricLabel: {
    color: theme.colors.text,
    fontFamily: theme.typography.family.body,
    fontSize: 13,
    fontWeight: theme.typography.weight.semibold,
    textAlign: "center",
  },
  goalText: {
    maxWidth: "100%",
    color: theme.colors.textSecondary,
    fontFamily: theme.typography.family.body,
    fontSize: 11,
    textAlign: "center",
  },
  badge: (color: string) => ({
    minWidth: 48,
    minHeight: 22,
    paddingHorizontal: theme.spacing[2],
    borderRadius: theme.radius.circle,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: color,
  }),
  badgeLabel: {
    color: "#FFFFFF",
    fontFamily: theme.typography.family.body,
    fontSize: 11,
    fontWeight: theme.typography.weight.semibold,
  },
}));
