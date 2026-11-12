import React from "react";
import { Text, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { Bar, CartesianChart } from "victory-native";

import type { ActivityHourlyBucketDto } from "@stepwhere/types";

import { ACTIVITY_UI } from "./activity-constants";

const CHART_SIDE_PADDING = 18;
const TOOLTIP_WIDTH = 132;
type RhythmToneKey = "empty" | "blueSoft" | "blueMedium" | "greenSoft" | "greenStrong";
const TONE_KEYS: RhythmToneKey[] = ["empty", "blueSoft", "blueMedium", "greenSoft", "greenStrong"];

type RhythmChartDatum = {
  blueMedium: number;
  blueSoft: number;
  empty: number;
  greenSoft: number;
  greenStrong: number;
  hour: number;
  steps: number;
};

type ActivityRhythmChartProps = {
  buckets: ActivityHourlyBucketDto[];
};

function formatHourLabel(hour: number) {
  const date = new Date();
  date.setHours(hour, 0, 0, 0);

  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
  }).format(date);
}

function formatHourRange(hour: number) {
  const nextHour = (hour + 1) % 24;

  return `${formatHourLabel(hour)} - ${formatHourLabel(nextHour)}`;
}

function getBucketTone(bucket: ActivityHourlyBucketDto, maxSteps: number): RhythmToneKey {
  if (bucket.steps <= 0 || maxSteps <= 0) {
    return "empty";
  }

  const ratio = bucket.steps / maxSteps;

  if (bucket.isPeak || ratio >= 0.75) {
    return "greenStrong";
  }

  if (ratio >= 0.5) {
    return "greenSoft";
  }

  if (ratio >= 0.25) {
    return "blueMedium";
  }

  return "blueSoft";
}

function getHourX(hour: number, chartWidth: number) {
  const innerWidth = Math.max(chartWidth - CHART_SIDE_PADDING * 2, 0);

  return CHART_SIDE_PADDING + (hour / 23) * innerWidth;
}

export function ActivityRhythmChart({ buckets }: ActivityRhythmChartProps) {
  const { theme } = useUnistyles();
  const [chartWidth, setChartWidth] = React.useState(0);
  const [selectedHour, setSelectedHour] = React.useState<number | null>(null);
  const maxSteps = buckets.reduce((currentMax, bucket) => Math.max(currentMax, bucket.steps), 0);
  const colors = {
    empty: "rgba(147, 197, 253, 0.22)",
    blueSoft: "rgba(147, 197, 253, 0.42)",
    blueMedium: "rgba(59, 130, 246, 0.52)",
    greenSoft: "rgba(34, 197, 94, 0.42)",
    greenStrong: theme.colors.primaryGreen,
  } as const;
  const data: RhythmChartDatum[] = buckets.map((bucket) => {
    const tone = getBucketTone(bucket, maxSteps);

    return {
      hour: bucket.hour,
      steps: bucket.steps,
      empty: tone === "empty" ? 1 : 0,
      blueSoft: tone === "blueSoft" ? bucket.steps : 0,
      blueMedium: tone === "blueMedium" ? bucket.steps : 0,
      greenSoft: tone === "greenSoft" ? bucket.steps : 0,
      greenStrong: tone === "greenStrong" ? bucket.steps : 0,
    };
  });
  const hasData = data.some((item) => item.steps > 0);
  const selectedBucket =
    selectedHour == null ? null : buckets.find((bucket) => bucket.hour === selectedHour) ?? null;
  const tooltipLeft =
    selectedHour == null || chartWidth <= 0
      ? 0
      : Math.max(
          8,
          Math.min(chartWidth - TOOLTIP_WIDTH, getHourX(selectedHour, chartWidth) - TOOLTIP_WIDTH / 2),
        );
  const markerLeft =
    selectedHour == null || chartWidth <= 0
      ? 0
      : Math.max(0, Math.min(chartWidth - 2, getHourX(selectedHour, chartWidth) - 1));

  function selectHourFromX(locationX: number) {
    if (chartWidth <= 0) {
      return;
    }

    const clampedX = Math.max(0, Math.min(locationX, chartWidth));
    const innerWidth = Math.max(chartWidth - CHART_SIDE_PADDING * 2, 1);
    const normalizedX = Math.max(0, Math.min(clampedX - CHART_SIDE_PADDING, innerWidth));
    const hour = Math.max(0, Math.min(23, Math.round((normalizedX / innerWidth) * 23)));

    setSelectedHour(hour);
  }

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Activity Rhythm</Text>
      <View
        onLayout={(event) => setChartWidth(event.nativeEvent.layout.width)}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={(event) => selectHourFromX(event.nativeEvent.locationX)}
        onResponderMove={(event) => selectHourFromX(event.nativeEvent.locationX)}
        onStartShouldSetResponder={() => true}
        style={styles.chartWrap}>
        {selectedBucket ? (
          <View pointerEvents="none" style={styles.tooltip(tooltipLeft)}>
            <Text style={styles.tooltipTitle}>{formatHourRange(selectedBucket.hour)}</Text>
            <Text style={styles.tooltipValue}>
              {selectedBucket.steps > 0
                ? `${selectedBucket.steps.toLocaleString()} steps`
                : "No movement recorded"}
            </Text>
            {selectedBucket.isPeak && selectedBucket.steps > 0 ? (
              <Text style={styles.tooltipMeta}>Peak activity</Text>
            ) : null}
          </View>
        ) : null}
        {selectedHour != null ? <View pointerEvents="none" style={styles.selectedMarker(markerLeft)} /> : null}
        <CartesianChart
          data={data}
          domainPadding={{ left: CHART_SIDE_PADDING, right: CHART_SIDE_PADDING, top: 16 }}
          padding={{ bottom: 10, left: 0, right: 0, top: 12 }}
          xAxis={{ lineWidth: 0, tickCount: 5 }}
          xKey="hour"
          yAxis={[{ lineWidth: 0, tickCount: 4 }]}
          yKeys={TONE_KEYS}
        >
          {({ chartBounds, points }) => (
            <>
              <Bar barWidth={9} chartBounds={chartBounds} color={colors.empty} points={points.empty} roundedCorners={{ topLeft: 4, topRight: 4 }} />
              <Bar
                barWidth={9}
                chartBounds={chartBounds}
                color={colors.blueSoft}
                points={points.blueSoft}
                roundedCorners={{ topLeft: 4, topRight: 4 }}
              />
              <Bar
                barWidth={9}
                chartBounds={chartBounds}
                color={colors.blueMedium}
                points={points.blueMedium}
                roundedCorners={{ topLeft: 4, topRight: 4 }}
              />
              <Bar
                barWidth={9}
                chartBounds={chartBounds}
                color={colors.greenSoft}
                points={points.greenSoft}
                roundedCorners={{ topLeft: 4, topRight: 4 }}
              />
              <Bar
                barWidth={9}
                chartBounds={chartBounds}
                color={colors.greenStrong}
                points={points.greenStrong}
                roundedCorners={{ topLeft: 4, topRight: 4 }}
              />
            </>
          )}
        </CartesianChart>
        {!hasData ? <Text style={styles.emptyCopy}>No movement recorded</Text> : null}
      </View>
      <View style={styles.footerLabels}>
        <Text style={styles.footerLabel}>12 AM</Text>
        <Text style={styles.footerLabel}>6 AM</Text>
        <Text style={styles.footerLabel}>12 PM</Text>
        <Text style={styles.footerLabel}>6 PM</Text>
        <Text style={styles.footerLabel}>11 PM</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  card: {
    marginTop: theme.spacing[4],
    marginHorizontal: theme.spacing[5],
    marginBottom: theme.spacing[6],
    padding: theme.spacing[4],
    borderRadius: theme.radius.card,
    borderWidth: 1,
    borderColor: theme.colors.chrome.cardBorder,
    backgroundColor: theme.colors.surface,
    gap: theme.spacing[3],
    ...theme.shadows.card,
  },
  title: {
    color: theme.colors.text,
    fontFamily: theme.typography.family.display,
    fontSize: 22,
    fontWeight: theme.typography.weight.semibold,
  },
  chartWrap: {
    height: ACTIVITY_UI.rhythmChartHeight,
    justifyContent: "center",
    position: "relative",
  },
  emptyCopy: {
    position: "absolute",
    alignSelf: "center",
    color: theme.colors.textSecondary,
    fontFamily: theme.typography.family.body,
    fontSize: 13,
  },
  footerLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  footerLabel: {
    color: theme.colors.textSecondary,
    fontFamily: theme.typography.family.body,
    fontSize: 12,
  },
  tooltip: (left: number) => ({
    position: "absolute",
    left,
    top: 8,
    width: TOOLTIP_WIDTH,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    borderRadius: theme.radius.button,
    borderWidth: 1,
    borderColor: theme.colors.chrome.cardBorder,
    backgroundColor: theme.colors.surface,
    zIndex: 2,
    ...theme.shadows.card,
  }),
  tooltipTitle: {
    color: theme.colors.text,
    fontFamily: theme.typography.family.body,
    fontSize: 12,
    fontWeight: theme.typography.weight.semibold,
  },
  tooltipValue: {
    marginTop: 2,
    color: theme.colors.text,
    fontFamily: theme.typography.family.body,
    fontSize: 13,
  },
  tooltipMeta: {
    marginTop: 2,
    color: theme.colors.primaryGreen,
    fontFamily: theme.typography.family.body,
    fontSize: 12,
    fontWeight: theme.typography.weight.semibold,
  },
  selectedMarker: (left: number) => ({
    position: "absolute",
    left,
    top: 48,
    bottom: 28,
    width: 2,
    borderRadius: theme.radius.circle,
    backgroundColor: theme.colors.primaryGreen,
    opacity: 0.85,
    zIndex: 1,
  }),
}));
