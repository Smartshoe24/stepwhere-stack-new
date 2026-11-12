import React from 'react';
import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

type BadgeProps = {
  label: string;
};

export function Badge({ label }: BadgeProps) {
  return (
    <View style={styles.badge}>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create(theme => ({
  badge: {
    minWidth: 16,
    height: 16,
    borderRadius: theme.radius.circle,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    backgroundColor: theme.colors.badge,
    borderWidth: 1,
    borderColor: theme.colors.surface,
  },
  label: {
    color: theme.colors.badgeText,
    fontFamily: theme.typography.family.body,
    fontSize: 9,
    fontWeight: theme.typography.weight.bold,
    lineHeight: 10,
  },
}));

