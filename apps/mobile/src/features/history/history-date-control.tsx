import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { AppIcon } from '@/components/ui/app-icon';
import { IconButton } from '@/components/ui/icon-button';

type HistoryDateControlProps = {
  canGoNext: boolean;
  canGoPrevious: boolean;
  isToday: boolean;
  label: string;
  showSampleDataBadge: boolean;
  subLabel: string;
  onNext: () => void;
  onOpenPicker: () => void;
  onPrevious: () => void;
  onToday: () => void;
};

/**
 * Mirrors ActivityDateRangeControl so the two adjacent tabs share one stepper
 * language: IconButton chevrons flanking a card that opens the picker.
 */
export function HistoryDateControl({
  canGoNext,
  canGoPrevious,
  isToday,
  label,
  showSampleDataBadge,
  subLabel,
  onNext,
  onOpenPicker,
  onPrevious,
  onToday,
}: HistoryDateControlProps) {
  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <IconButton
          accessibilityLabel="Previous day"
          disabled={!canGoPrevious}
          icon="chevron-left"
          onPress={onPrevious}
        />
        <Pressable
          accessibilityHint="Opens the date picker"
          accessibilityLabel={`Selected day, ${subLabel}`}
          accessibilityRole="button"
          onPress={onOpenPicker}
          style={({ pressed }) => [styles.center, pressed && styles.pressed]}>
          <AppIcon color={styles.centerIcon.color} name="calendar" size={18} />
          <View style={styles.centerCopy}>
            <Text numberOfLines={1} style={styles.label}>{label}</Text>
            {label !== subLabel ? (
              <Text numberOfLines={1} style={styles.subLabel}>{subLabel}</Text>
            ) : null}
          </View>
          <AppIcon color={styles.chevron.color} name="chevron-down" size={16} />
        </Pressable>
        <IconButton
          accessibilityLabel="Next day"
          disabled={!canGoNext}
          icon="chevron-right"
          onPress={onNext}
        />
      </View>

      {showSampleDataBadge || !isToday ? (
        <View style={styles.auxiliaryRow}>
          {showSampleDataBadge ? (
            <View
              accessibilityLabel="Development sample history data."
              accessibilityRole="text"
              accessible
              style={styles.sampleDataBadge}>
              <AppIcon color={styles.sampleDataIcon.color} name="info" size={12} />
              <Text style={styles.sampleDataLabel}>Sample data</Text>
            </View>
          ) : null}

          {/* Only offered when it does something — no dead control on today. */}
          {isToday ? null : (
            <Pressable
              accessibilityRole="button"
              onPress={onToday}
              style={({ pressed }) => [styles.todayButton, pressed && styles.pressed]}>
              <Text style={styles.todayLabel}>Jump to today</Text>
            </Pressable>
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create(theme => ({
  container: {
    marginTop: theme.spacing[4],
    marginHorizontal: theme.spacing[5],
    gap: theme.spacing[2],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[3],
  },
  auxiliaryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing[2],
  },
  center: {
    flex: 1,
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing[2],
    paddingHorizontal: theme.spacing[4],
    borderRadius: theme.radius.button,
    borderWidth: 1,
    borderColor: theme.colors.chrome.cardBorder,
    backgroundColor: theme.colors.surface,
    ...theme.shadows.card,
  },
  centerCopy: {
    flexShrink: 1,
    alignItems: 'center',
  },
  centerIcon: {
    color: theme.colors.icon,
  },
  chevron: {
    color: theme.colors.textMuted,
  },
  label: {
    color: theme.colors.text,
    fontFamily: theme.typography.family.body,
    ...theme.typography.text.bodyLarge,
    fontWeight: theme.typography.weight.semibold,
  },
  subLabel: {
    color: theme.colors.textMuted,
    fontFamily: theme.typography.family.body,
    ...theme.typography.text.caption,
  },
  sampleDataBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[1],
    paddingVertical: theme.spacing[1],
    paddingHorizontal: theme.spacing[2],
    borderRadius: theme.radius.button,
    borderWidth: 1,
    borderColor: theme.colors.chrome.cardBorder,
    backgroundColor: theme.colors.surfaceMuted,
  },
  sampleDataIcon: {
    color: theme.colors.textSecondary,
  },
  sampleDataLabel: {
    color: theme.colors.textSecondary,
    fontFamily: theme.typography.family.body,
    ...theme.typography.text.meta,
    fontWeight: theme.typography.weight.medium,
  },
  todayButton: {
    alignSelf: 'center',
    minHeight: 32,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing[3],
  },
  todayLabel: {
    color: theme.colors.navActive,
    fontFamily: theme.typography.family.body,
    ...theme.typography.text.meta,
    fontWeight: theme.typography.weight.semibold,
  },
  pressed: {
    opacity: theme.colors.button.pressedOpacity,
  },
}));
