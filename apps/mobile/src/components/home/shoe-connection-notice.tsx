import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { AppIcon } from '@/components/ui/app-icon';

type ShoeConnectionNoticeProps = {
  batteryPercent: number | null;
  childName: string;
  kind: 'offline' | 'offline_low_battery';
  onHelpPress: () => void;
};

/**
 * Sits under the telemetry bar when the shoe has gone quiet. "Offline" alone does
 * not tell a parent what to do, and the usual cause is an empty battery.
 */
function ShoeConnectionNoticeComponent({
  batteryPercent,
  childName,
  kind,
  onHelpPress,
}: ShoeConnectionNoticeProps) {
  const firstName = childName.trim().split(/\s+/)[0] || childName;
  const lowBattery = kind === 'offline_low_battery';
  const message = lowBattery
    ? `Last seen at ${batteryPercent ?? 0}%. The battery may be empty. Charge ${firstName}'s shoe.`
    : `${firstName}'s shoe is offline. Make sure it's charged.`;

  return (
    <View style={styles.container}>
      <View style={styles.iconPlate(lowBattery)}>
        <AppIcon
          color={lowBattery ? styles.dangerIcon.color : styles.warningIcon.color}
          name={lowBattery ? 'battery-low' : 'exclamation'}
          size={18}
        />
      </View>
      <Text style={styles.message}>{message}</Text>
      <Pressable
        accessibilityLabel="Why isn't the shoe connecting?"
        accessibilityRole="button"
        hitSlop={8}
        onPress={onHelpPress}
        style={({ pressed }) => [styles.helpButton, pressed && styles.pressed]}>
        <Text style={styles.helpLabel}>Help</Text>
      </Pressable>
    </View>
  );
}

export const ShoeConnectionNotice = React.memo(ShoeConnectionNoticeComponent);

const styles = StyleSheet.create((theme) => ({
  container: {
    marginTop: theme.spacing[2],
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[3],
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[3],
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.chrome.cardBorder,
    backgroundColor: theme.colors.surface,
    ...theme.shadows.card,
  },
  iconPlate: (lowBattery: boolean) => ({
    width: 32,
    height: 32,
    borderRadius: theme.radius.circle,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: lowBattery ? theme.colors.alertBackground : theme.colors.surfaceMuted,
  }),
  dangerIcon: {
    color: theme.colors.alertText,
  },
  warningIcon: {
    color: theme.colors.telemetry.warning,
  },
  message: {
    flex: 1,
    color: theme.colors.text,
    fontFamily: theme.typography.family.body,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: theme.typography.weight.medium,
  },
  helpButton: {
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[1],
  },
  helpLabel: {
    color: theme.colors.primaryGreen,
    fontFamily: theme.typography.family.body,
    fontSize: 13,
    lineHeight: 16,
    fontWeight: theme.typography.weight.semibold,
  },
  pressed: {
    opacity: theme.colors.button.pressedOpacity,
  },
}));
