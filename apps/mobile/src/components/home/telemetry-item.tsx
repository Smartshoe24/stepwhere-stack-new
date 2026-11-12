import React from 'react';
import { Text, View } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { StyleSheet } from 'react-native-unistyles';

import { AppIcon } from '@/components/ui/app-icon';

type TelemetryItemProps = {
  blinkIcon?: boolean;
  icon?: React.ComponentProps<typeof AppIcon>['name'];
  iconContent?: React.ReactNode;
  iconColor?: string;
  label: string;
  value?: string;
  valueColor?: string;
};

export function TelemetryItem({
  blinkIcon = false,
  icon,
  iconContent,
  iconColor,
  label,
  value,
  valueColor,
}: TelemetryItemProps) {
  const opacity = useSharedValue(1);

  React.useEffect(() => {
    if (blinkIcon) {
      opacity.value = withRepeat(withTiming(0.35, { duration: 650 }), -1, true);
      return;
    }

    cancelAnimation(opacity);
    opacity.value = withTiming(1, { duration: 120 });
  }, [blinkIcon, opacity]);

  const iconStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }), [opacity]);

  return (
    <View style={styles.container}>
      <Animated.View style={iconStyle}>
        {iconContent ?? (icon ? <AppIcon color={iconColor ?? styles.accent.color} name={icon} size={22} /> : null)}
      </Animated.View>
      <View style={styles.textBlock}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.value(valueColor)}>{value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create(theme => ({
  accent: {
    color: theme.colors.telemetry.accent,
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[2],
  },
  textBlock: {
    gap: 2,
    minWidth: 0,
  },
  label: {
    color: theme.colors.textMuted,
    fontFamily: theme.typography.family.body,
    fontSize: theme.typography.size.telemetryLabel,
    lineHeight: 12,
    fontWeight: theme.typography.weight.regular,
  },
  value: (valueColor?: string) => ({
    color: valueColor ?? theme.colors.textSecondary,
    fontFamily: theme.typography.family.body,
    fontSize: theme.typography.size.telemetryValue,
    lineHeight: 13,
    fontWeight: theme.typography.weight.medium,
  }),
}));
