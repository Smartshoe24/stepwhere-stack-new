import React from 'react';
import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import type { ChildStatus } from '@/data/children';

type StatusPillProps = {
  label: string;
  status: ChildStatus;
};

export function StatusPill({ label, status }: StatusPillProps) {
  return (
    <View style={styles.container(status)}>
      <Text style={styles.label(status)}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create(theme => ({
  container: (status: ChildStatus) => ({
    paddingHorizontal: theme.spacing[2],
    paddingVertical: 3,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.status[status].background,
  }),
  label: (status: ChildStatus) => ({
    color: theme.status[status].text,
    fontFamily: theme.typography.family.body,
    fontSize: 10,
    lineHeight: 12,
    fontWeight: theme.typography.weight.medium,
  }),
}));

