import type { ChildHistoryEventDto } from '@stepwhere/types';

import React from 'react';
import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { AppIcon } from '@/components/ui/app-icon';

type HistoryMapProps = {
  bottomOverlayHeight: number;
  events: ChildHistoryEventDto[];
  interactive?: boolean;
  onMapPress: () => void;
  onSelectEvent: (event: ChildHistoryEventDto) => void;
  selectedEventId: string | null;
};

/**
 * Web fallback. Previously this scattered overlapping labels at pseudo-random
 * percentages, which read as a broken map. An honest unavailable state is better
 * than a fake one.
 */
export function HistoryMap(_props: HistoryMapProps) {
  return (
    <View style={styles.container}>
      <AppIcon color={styles.icon.color} name="layers" size={28} />
      <Text style={styles.title}>Map preview isn&apos;t available here</Text>
      <Text style={styles.body}>Open Stepwhere on your phone to see the route on a map.</Text>
    </View>
  );
}

const styles = StyleSheet.create(theme => ({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing[2],
    padding: theme.spacing[5],
    backgroundColor: theme.colors.map,
  },
  icon: {
    color: theme.colors.textMuted,
  },
  title: {
    color: theme.colors.text,
    fontFamily: theme.typography.family.body,
    ...theme.typography.text.body,
    fontWeight: theme.typography.weight.semibold,
    textAlign: 'center',
  },
  body: {
    color: theme.colors.textSecondary,
    fontFamily: theme.typography.family.body,
    ...theme.typography.text.meta,
    textAlign: 'center',
  },
}));
