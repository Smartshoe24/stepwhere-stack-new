import React from "react";
import { View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import { TelemetryItem } from "@/components/home/telemetry-item";
import { TelemetryStatusIcon } from "@/components/home/telemetry-status-icon";
import type { OverviewChildCard } from "@/features/overview/overview-ui";
import {
  getBatteryPresentation,
  getSignalPresentation,
  getStatusPresentation,
  type TelemetryTone,
} from "@/features/overview/telemetry-presentation";

type TelemetryBarProps = {
  selectedChild: OverviewChildCard;
};

export function TelemetryBar({ selectedChild }: TelemetryBarProps) {
  const { theme } = useUnistyles();
  const battery = getBatteryPresentation(
    selectedChild.batteryPercent,
    selectedChild.telemetryState,
  );
  const signal = getSignalPresentation({
    gpsState: selectedChild.connectivity.gpsState,
    gsmState: selectedChild.connectivity.gsmState,
    satelliteCount: selectedChild.satelliteCount,
    telemetryState: selectedChild.telemetryState,
  });
  const status = getStatusPresentation(selectedChild.telemetryState);

  return (
    <View style={styles.container}>
      <View style={styles.column}>
        <TelemetryItem
          blinkIcon={battery.blinking}
          icon={battery.icon}
          iconColor={getToneColor(theme, battery.tone)}
          label="Battery"
          value={battery.label}
          valueColor={getToneColor(theme, battery.tone)}
        />
      </View>
      <View style={styles.divider} />
      <View style={styles.column}>
        <TelemetryItem
          blinkIcon={signal.blinking}
          icon={signal.icon}
          iconColor={getToneColor(theme, signal.tone)}
          label="Signal"
          value={signal.label}
          valueColor={getToneColor(theme, signal.tone)}
        />
      </View>
      <View style={styles.divider} />
      <View style={styles.column}>
        <TelemetryItem
          blinkIcon={status.blinking}
          iconContent={status.statusSymbol ? (
            <TelemetryStatusIcon
              color={getToneColor(theme, status.tone)}
              symbol={status.statusSymbol}
            />
          ) : undefined}
          label="Status"
          value={status.label}
          valueColor={getToneColor(theme, status.tone)}
        />
      </View>
    </View>
  );
}

function getToneColor(theme: ReturnType<typeof useUnistyles>["theme"], tone: TelemetryTone) {
  switch (tone) {
    case "danger":
      return theme.colors.telemetry.danger;
    case "muted":
      return theme.colors.telemetry.muted;
    case "sleep":
      return theme.colors.telemetry.sleep;
    case "warning":
      return theme.colors.telemetry.warning;
    default:
      return theme.colors.telemetry.positive;
  }
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    paddingHorizontal: theme.spacing[4],
    paddingVertical: 14,
    ...theme.shadows.card,
  },
  column: {
    flex: 1,
    justifyContent: "center",
    flexWrap: "wrap",
  },
  divider: {
    width: 1,
    height: 32,
    backgroundColor: theme.colors.divider,
    marginHorizontal: theme.spacing[3],
  },
}));
