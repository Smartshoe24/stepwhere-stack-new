import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import React from 'react';
import { Modal, Platform, Pressable, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StyleSheet } from 'react-native-unistyles';

import { AppIcon } from '@/components/ui/app-icon';

import { formatDateSubLabel, fromLocalDateKey, toLocalDateKey } from './history-formatters';

type HistoryDateSheetProps = {
  maximumDate: string;
  minimumDate: string | null;
  onClose: () => void;
  onSelectDate: (dateKey: string) => void;
  value: string;
  visible: boolean;
};

/**
 * Adopts the app's shared modal-sheet recipe (scrim + maxWidth 560 + circular
 * close). Android previously got a bare picker with no sheet chrome at all; it
 * now uses the platform dialog, which is the correct Android affordance.
 */
export function HistoryDateSheet({
  maximumDate,
  minimumDate,
  onClose,
  onSelectDate,
  value,
  visible,
}: HistoryDateSheetProps) {
  if (Platform.OS !== 'ios') {
    if (!visible) {
      return null;
    }

    return (
      <DateTimePicker
        display="calendar"
        maximumDate={fromLocalDateKey(maximumDate)}
        minimumDate={minimumDate ? fromLocalDateKey(minimumDate) : undefined}
        mode="date"
        onChange={(event: DateTimePickerEvent, date?: Date) => {
          if (event.type === 'set' && date) {
            onSelectDate(toLocalDateKey(date));
          }

          onClose();
        }}
        value={fromLocalDateKey(value)}
      />
    );
  }

  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="overFullScreen"
      transparent
      visible={visible}>
      {visible ? (
        <HistoryDateSheetBody
          key={value}
          maximumDate={maximumDate}
          minimumDate={minimumDate}
          onClose={onClose}
          onSelectDate={onSelectDate}
          value={value}
        />
      ) : null}
    </Modal>
  );
}

function HistoryDateSheetBody({
  maximumDate,
  minimumDate,
  onClose,
  onSelectDate,
  value,
}: Omit<HistoryDateSheetProps, 'visible'>) {
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = React.useState(value);

  return (
    <SafeAreaView edges={['bottom']} style={styles.safeArea}>
      <Pressable accessibilityLabel="Close date picker" onPress={onClose} style={styles.scrim} />
      <View accessibilityViewIsModal style={styles.sheet(Math.max(insets.bottom, 12))}>
        <View style={styles.header}>
          <View style={styles.headerBlock}>
            <Text style={styles.title}>Select day</Text>
            <Text style={styles.subtitle}>{formatDateSubLabel(draft)}</Text>
          </View>
          <Pressable
            accessibilityLabel="Close"
            accessibilityRole="button"
            onPress={onClose}
            style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}>
            <AppIcon color={styles.closeIcon.color} name="close" size={18} />
          </Pressable>
        </View>

        <DateTimePicker
          display="inline"
          maximumDate={fromLocalDateKey(maximumDate)}
          minimumDate={minimumDate ? fromLocalDateKey(minimumDate) : undefined}
          mode="date"
          onChange={(_event, date) => {
            if (date) {
              setDraft(toLocalDateKey(date));
            }
          }}
          value={fromLocalDateKey(draft)}
        />

        <Pressable
          accessibilityRole="button"
          onPress={() => {
            onSelectDate(draft);
            onClose();
          }}
          style={({ pressed }) => [styles.applyButton, pressed && styles.pressed]}>
          <Text style={styles.applyLabel}>View this day</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create(theme => ({
  safeArea: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: theme.colors.shadowStrong,
    opacity: 0.32,
  },
  sheet: (bottomInset: number) => ({
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
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
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: theme.spacing[3],
  },
  headerBlock: {
    flex: 1,
    gap: theme.spacing[1],
  },
  title: {
    color: theme.colors.text,
    fontFamily: theme.typography.family.display,
    ...theme.typography.text.titleSmall,
    fontSize: 20,
    fontWeight: theme.typography.weight.bold,
  },
  subtitle: {
    color: theme.colors.textSecondary,
    fontFamily: theme.typography.family.body,
    ...theme.typography.text.body,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: theme.radius.circle,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surfaceMuted,
  },
  closeIcon: {
    color: theme.colors.icon,
  },
  applyButton: {
    minHeight: 50,
    borderRadius: theme.radius.button,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.primaryGreen,
  },
  applyLabel: {
    color: '#FFFFFF',
    fontFamily: theme.typography.family.body,
    ...theme.typography.text.bodyLarge,
    fontSize: 16,
    fontWeight: theme.typography.weight.semibold,
  },
  pressed: {
    opacity: theme.colors.button.pressedOpacity,
  },
}));
