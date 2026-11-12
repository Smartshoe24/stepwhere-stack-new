import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import React from "react";
import { Modal, Platform, Pressable, Text, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import { AppIcon } from "@/components/ui/app-icon";

type DateOfBirthFieldProps = {
  defaultPickerDate?: Date;
  disabled?: boolean;
  error?: string | null;
  label?: string;
  onChange: (date: Date) => void;
  placeholder?: string;
  value: Date | null;
};

function formatDateLabel(value: Date | null, placeholder: string) {
  if (!value) {
    return placeholder;
  }

  return value.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function DateOfBirthField({
  defaultPickerDate = new Date("2015-01-01T00:00:00.000Z"),
  disabled = false,
  error = null,
  label = "Date of birth",
  onChange,
  placeholder = "Select date of birth",
  value,
}: DateOfBirthFieldProps) {
  const { rt } = useUnistyles();
  const [visible, setVisible] = React.useState(false);
  const [pendingDate, setPendingDate] = React.useState(value ?? defaultPickerDate);
  const themeVariant = rt.themeName === "dark" ? "dark" : "light";

  function openPicker() {
    if (disabled) {
      return;
    }

    setPendingDate(value ?? defaultPickerDate);
    setVisible(true);
  }

  function handleAndroidChange(event: DateTimePickerEvent, nextDate?: Date) {
    setVisible(false);
    if (event.type === "set" && nextDate) {
      onChange(nextDate);
    }
  }

  return (
    <View style={styles.block}>
      <Pressable
        accessibilityLabel={`${label}. ${formatDateLabel(value, placeholder)}`}
        accessibilityRole="button"
        disabled={disabled}
        onPress={openPicker}
        style={({ pressed }) => [
          styles.field(Boolean(error)),
          disabled && styles.disabled,
          pressed && !disabled && styles.pressed,
        ]}
      >
        <View style={styles.fieldCopy}>
          <Text style={styles.label}>{label}</Text>
          <Text style={styles.value(Boolean(value))}>{formatDateLabel(value, placeholder)}</Text>
        </View>
        <AppIcon color={styles.calendarIcon.color} name="calendar" size={18} />
      </Pressable>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {Platform.OS !== "ios" && visible ? (
        <DateTimePicker
          display="calendar"
          maximumDate={new Date()}
          mode="date"
          onChange={handleAndroidChange}
          value={pendingDate}
        />
      ) : null}

      {Platform.OS === "ios" ? (
        <Modal animationType="fade" onRequestClose={() => setVisible(false)} transparent visible={visible}>
          <Pressable accessibilityLabel="Close date picker" onPress={() => setVisible(false)} style={styles.backdrop}>
            <Pressable style={styles.sheet}>
              <View style={styles.sheetHeader}>
                <Pressable accessibilityRole="button" onPress={() => setVisible(false)} style={styles.headerAction}>
                  <Text style={styles.cancelText}>Cancel</Text>
                </Pressable>
                <Text style={styles.sheetTitle}>{label}</Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    onChange(pendingDate);
                    setVisible(false);
                  }}
                  style={styles.headerAction}
                >
                  <Text style={styles.doneText}>Done</Text>
                </Pressable>
              </View>
              <DateTimePicker
                display="inline"
                maximumDate={new Date()}
                mode="date"
                onChange={(_, nextDate) => {
                  if (nextDate) {
                    setPendingDate(nextDate);
                  }
                }}
                themeVariant={themeVariant}
                value={pendingDate}
              />
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  block: { gap: theme.spacing[2] },
  field: (hasError: boolean) => ({
    minHeight: 54,
    borderRadius: theme.radius.button,
    borderWidth: 1,
    borderColor: hasError ? theme.colors.alertBorder : theme.colors.chrome.cardBorder,
    backgroundColor: theme.colors.surfaceMuted,
    paddingHorizontal: theme.spacing[4],
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  }),
  fieldCopy: { gap: 2 },
  label: {
    color: theme.colors.text,
    fontFamily: theme.typography.family.body,
    fontSize: 13,
    lineHeight: 16,
    fontWeight: theme.typography.weight.semibold,
  },
  value: (hasValue: boolean) => ({
    color: hasValue ? theme.colors.text : theme.colors.textMuted,
    fontFamily: theme.typography.family.body,
    fontSize: 15,
    lineHeight: 18,
    fontWeight: theme.typography.weight.medium,
  }),
  calendarIcon: { color: theme.colors.textSecondary },
  error: {
    color: theme.colors.alertText,
    fontFamily: theme.typography.family.body,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: theme.typography.weight.medium,
  },
  disabled: { opacity: 0.55 },
  pressed: { opacity: theme.colors.button.pressedOpacity },
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0, 0, 0, 0.35)",
  },
  sheet: {
    borderTopLeftRadius: theme.radius.card,
    borderTopRightRadius: theme.radius.card,
    borderWidth: 1,
    borderColor: theme.colors.chrome.cardBorder,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: theme.spacing[4],
    paddingTop: theme.spacing[4],
    paddingBottom: theme.spacing[5],
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: theme.spacing[2],
  },
  sheetTitle: {
    color: theme.colors.text,
    fontFamily: theme.typography.family.display,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: theme.typography.weight.semibold,
  },
  headerAction: { minWidth: 60, minHeight: 44, alignItems: "center", justifyContent: "center" },
  cancelText: {
    color: theme.colors.textSecondary,
    fontFamily: theme.typography.family.body,
    fontSize: 15,
    fontWeight: theme.typography.weight.medium,
  },
  doneText: {
    color: theme.colors.navActive,
    fontFamily: theme.typography.family.body,
    fontSize: 15,
    fontWeight: theme.typography.weight.semibold,
  },
}));
