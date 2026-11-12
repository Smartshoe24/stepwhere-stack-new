import type { ChildHistoryEventDto } from '@stepwhere/types';

import React from 'react';
import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { buildStayNumbers } from './history-event-visuals';
import { HistoryEventRow } from './history-event-row';

type HistoryTimelineProps = {
  events: ChildHistoryEventDto[];
  isProcessing: boolean;
  onSelectEvent: (event: ChildHistoryEventDto) => void;
  selectedEventId: string | null;
};

/**
 * Renders inline in the page scroll instead of inside a nested FlatList in a
 * sheet. That removes the gesture conflict, the scrollToIndex timeouts, and the
 * 152px of trailing dead space the old sheet needed.
 */
export function HistoryTimeline({
  events,
  isProcessing,
  onSelectEvent,
  selectedEventId,
}: HistoryTimelineProps) {
  const stayNumbers = React.useMemo(() => buildStayNumbers(events), [events]);

  return (
    <View style={styles.container}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Timeline</Text>
        {isProcessing ? (
          <View style={styles.processingPill}>
            <Text style={styles.processingText}>Updating</Text>
          </View>
        ) : null}
      </View>

      {events.map((event, index) => (
        <HistoryEventRow
          event={event}
          isFirst={index === 0}
          isLast={index === events.length - 1}
          key={event.id}
          onPress={() => onSelectEvent(event)}
          selected={event.id === selectedEventId}
          stayNumber={stayNumbers.get(event.id) ?? null}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create(theme => ({
  container: {
    marginTop: theme.spacing[5],
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing[3],
    marginHorizontal: theme.spacing[5],
    marginBottom: theme.spacing[3],
  },
  sectionTitle: {
    color: theme.colors.textSecondary,
    fontFamily: theme.typography.family.body,
    ...theme.typography.text.overline,
    fontWeight: theme.typography.weight.semibold,
  },
  processingPill: {
    paddingHorizontal: theme.spacing[2],
    paddingVertical: 3,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surfaceMuted,
  },
  processingText: {
    color: theme.colors.textSecondary,
    fontFamily: theme.typography.family.body,
    ...theme.typography.text.overline,
    fontWeight: theme.typography.weight.medium,
  },
}));
