import React from "react";
import { View } from "react-native";
import { SegmentedControl } from "@expo/ui/community/segmented-control";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import type { ActivityPeriod } from "@stepwhere/types";

const PERIODS: ActivityPeriod[] = ["day", "week", "month", "year"];
const PERIOD_LABELS: Record<ActivityPeriod, string> = {
  day: "Day",
  week: "Week",
  month: "Month",
  year: "Year",
};

type ActivityPeriodTabsProps = {
  onChange: (period: ActivityPeriod) => void;
  value: ActivityPeriod;
};

export function ActivityPeriodTabs({ onChange, value }: ActivityPeriodTabsProps) {
  const { rt } = useUnistyles();
  const themeName = rt.themeName === "dark" ? "dark" : "light";
  const selectedIndex = Math.max(0, PERIODS.indexOf(value));

  return (
    <View style={styles.container}>
      <SegmentedControl
        appearance={themeName}
        onChange={(event) => {
          const nextPeriod = PERIODS[event.nativeEvent.selectedSegmentIndex];

          if (nextPeriod) {
            onChange(nextPeriod);
          }
        }}
        selectedIndex={selectedIndex}
        style={styles.segmentedControl}
        values={PERIODS.map((period) => PERIOD_LABELS[period])}
      />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    marginTop: theme.spacing[4],
    marginHorizontal: theme.spacing[5],
  },
  segmentedControl: {
    width: "100%",
    minHeight: 42,
  },
}));
