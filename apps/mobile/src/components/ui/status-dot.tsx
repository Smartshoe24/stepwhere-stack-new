import React from 'react';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import type { ChildStatus } from '@/data/children';

type StatusDotProps = {
  size?: number;
  status: ChildStatus;
};

export function StatusDot({ size = 6, status }: StatusDotProps) {
  return <View style={styles.dot(status, size)} />;
}

const styles = StyleSheet.create(theme => ({
  dot: (status: ChildStatus, size: number) => ({
    width: size,
    height: size,
    borderRadius: theme.radius.circle,
    backgroundColor: theme.status[status].main,
  }),
}));

