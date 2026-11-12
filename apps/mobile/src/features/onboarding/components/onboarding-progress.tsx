import React from 'react';
import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

type OnboardingProgressProps = {
  current: number;
  label: string;
  total: number;
};

export function OnboardingProgress({
  current,
  label,
  total,
}: OnboardingProgressProps) {
  return (
    <View style={styles.container}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.counter}>{`${current}/${total}`}</Text>
      </View>
      <View style={styles.track}>
        <View style={styles.fill(current / total)} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create(theme => ({
  container: {
    gap: theme.spacing[2],
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  label: {
    color: theme.colors.textSecondary,
    fontFamily: theme.typography.family.body,
    fontSize: 12,
    fontWeight: theme.typography.weight.medium,
    lineHeight: 16,
  },
  counter: {
    color: theme.colors.textMuted,
    fontFamily: theme.typography.family.body,
    fontSize: 12,
    fontWeight: theme.typography.weight.medium,
    lineHeight: 16,
  },
  track: {
    height: 6,
    borderRadius: theme.radius.circle,
    overflow: 'hidden',
    backgroundColor: theme.colors.surfaceMuted,
  },
  fill: (progress: number) => ({
    height: '100%',
    width: `${Math.max(0, Math.min(progress, 1)) * 100}%`,
    borderRadius: theme.radius.circle,
    backgroundColor: theme.colors.primaryGreen,
  }),
}));
