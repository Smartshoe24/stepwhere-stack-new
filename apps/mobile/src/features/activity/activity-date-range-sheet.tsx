import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";

import React from "react";
import { Modal, Platform, Pressable, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet } from "react-native-unistyles";

import type { ActivityPeriod } from "@stepwhere/types";

import { AppIcon } from "@/components/ui/app-icon";

import type { ActivityDateRange } from "./activity-date";
import { getRangeLabel } from "./activity-date";

type ActivityDateRangeSheetProps = {
  onApply: (range: ActivityDateRange) => void;
  onClose: () => void;
  period: ActivityPeriod;
  value: ActivityDateRange;
  visible: boolean;
};

export function ActivityDateRangeSheet({
  onApply,
  onClose,
  period,
  value,
  visible,
}: ActivityDateRangeSheetProps) {
  const stateKey = `${period}:${value.startDate}:${value.endDate}:${visible ? "open" : "closed"}`;

  return (
    <Modal animationType="slide" onRequestClose={onClose} presentationStyle="overFullScreen" transparent visible={visible}>
      {visible ? (
        <ActivityDateRangeSheetBody
          key={stateKey}
          onApply={onApply}
          onClose={onClose}
          period={period}
          value={value}
        />
      ) : null}
    </Modal>
  );
}

type ActivityDateRangeSheetBodyProps = Omit<ActivityDateRangeSheetProps, "visible">;

function ActivityDateRangeSheetBody({
  onApply,
  onClose,
  period,
  value,
}: ActivityDateRangeSheetBodyProps) {
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = React.useState(() => value);
  const [editingKey, setEditingKey] = React.useState<"startDate" | "endDate">("startDate");

  const selectedDate = editingKey === "startDate" ? draft.startDate : draft.endDate;
  const pickerDate = new Date(`${selectedDate}T12:00:00`);
  const isInvalidRange = new Date(`${draft.startDate}T12:00:00`) > new Date(`${draft.endDate}T12:00:00`);

  function handleDateChange(_event: DateTimePickerEvent, nextDate?: Date) {
    if (!nextDate) {
      return;
    }

    const normalized = nextDate.toISOString().slice(0, 10);
    setDraft((current) => ({
      ...current,
      [editingKey]: normalized,
      ...(period === "day" ? { startDate: normalized, endDate: normalized } : null),
    }));
  }

  return (
    <SafeAreaView edges={["bottom"]} style={styles.safeArea}>
      <Pressable onPress={onClose} style={styles.scrim} />
      <View style={styles.sheet(Math.max(insets.bottom, 12))}>
        <View style={styles.header}>
          <View style={styles.headerBlock}>
            <Text style={styles.title}>{period === "day" ? "Select date" : "Select range"}</Text>
            <Text style={styles.subtitle}>{getRangeLabel(period, draft)}</Text>
          </View>
          <Pressable onPress={onClose} style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}>
            <AppIcon color={styles.closeIcon.color} name="close" size={18} />
          </Pressable>
        </View>

        {period !== "day" ? (
          <View style={styles.fieldRow}>
            <Pressable onPress={() => setEditingKey("startDate")} style={({ pressed }) => [styles.dateField(editingKey === "startDate"), pressed && styles.pressed]}>
              <Text style={styles.fieldLabel}>Start</Text>
              <Text style={styles.fieldValue}>{draft.startDate}</Text>
            </Pressable>
            <Pressable onPress={() => setEditingKey("endDate")} style={({ pressed }) => [styles.dateField(editingKey === "endDate"), pressed && styles.pressed]}>
              <Text style={styles.fieldLabel}>End</Text>
              <Text style={styles.fieldValue}>{draft.endDate}</Text>
            </Pressable>
          </View>
        ) : null}

        <DateTimePicker
          display={Platform.OS === "ios" ? "inline" : "default"}
          maximumDate={new Date()}
          mode="date"
          onChange={handleDateChange}
          value={pickerDate}
        />

        {isInvalidRange ? <Text style={styles.errorText}>End date must be on or after start date.</Text> : null}

        <Pressable
          disabled={isInvalidRange}
          onPress={() => {
            if (isInvalidRange) {
              return;
            }

            onApply(draft);
          }}
          style={({ pressed }) => [styles.applyButton, pressed && styles.pressed, isInvalidRange && styles.applyButtonDisabled]}>
          <Text style={styles.applyLabel}>Apply</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create((theme) => ({
  safeArea: {
    flex: 1,
    justifyContent: "flex-end",
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: theme.colors.shadowStrong,
    opacity: 0.32,
  },
  sheet: (bottomInset: number) => ({
    width: "100%",
    maxWidth: 560,
    alignSelf: "center",
    borderTopLeftRadius: theme.radius.card,
    borderTopRightRadius: theme.radius.card,
    borderWidth: 1,
    borderColor: theme.colors.chrome.cardBorder,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: theme.spacing[5],
    paddingTop: theme.spacing[5],
    paddingBottom: bottomInset + theme.spacing[4],
    gap: theme.spacing[4],
    ...theme.shadows.floating,
  }),
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: theme.spacing[3],
  },
  headerBlock: {
    flex: 1,
    gap: theme.spacing[1],
  },
  title: {
    color: theme.colors.text,
    fontFamily: theme.typography.family.display,
    fontSize: 20,
    fontWeight: theme.typography.weight.bold,
  },
  subtitle: {
    color: theme.colors.textSecondary,
    fontFamily: theme.typography.family.body,
    fontSize: theme.typography.size.body,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: theme.radius.circle,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surfaceMuted,
  },
  closeIcon: {
    color: theme.colors.icon,
  },
  fieldRow: {
    flexDirection: "row",
    gap: theme.spacing[3],
  },
  dateField: (active: boolean) => ({
    flex: 1,
    padding: theme.spacing[3],
    borderRadius: theme.radius.button,
    borderWidth: 1,
    borderColor: active ? theme.colors.primaryGreen : theme.colors.chrome.cardBorder,
    backgroundColor: active ? theme.colors.softGreen : theme.colors.surfaceMuted,
    gap: 4,
  }),
  fieldLabel: {
    color: theme.colors.textSecondary,
    fontFamily: theme.typography.family.body,
    fontSize: 12,
  },
  fieldValue: {
    color: theme.colors.text,
    fontFamily: theme.typography.family.body,
    fontSize: 15,
    fontWeight: theme.typography.weight.semibold,
  },
  errorText: {
    color: theme.colors.alertText,
    fontFamily: theme.typography.family.body,
    fontSize: 13,
  },
  applyButton: {
    minHeight: 50,
    borderRadius: theme.radius.button,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.primaryGreen,
  },
  applyButtonDisabled: {
    opacity: 0.45,
  },
  applyLabel: {
    color: "#FFFFFF",
    fontFamily: theme.typography.family.body,
    fontSize: 16,
    fontWeight: theme.typography.weight.semibold,
  },
  pressed: {
    opacity: theme.colors.button.pressedOpacity,
  },
}));
