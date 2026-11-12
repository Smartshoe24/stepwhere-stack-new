import type { ChildHistoryEventDto } from '@stepwhere/types';

import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { AppIcon } from '@/components/ui/app-icon';

import { HistoryMap } from './history-map';

const MAP_CARD_HEIGHT = 190;

type HistoryMapCardProps = {
  events: ChildHistoryEventDto[];
  onExpand: () => void;
  onSelectEvent: (event: ChildHistoryEventDto) => void;
  selectedEventId: string | null;
};

/**
 * A preview, not the main event. The map used to occupy ~25% of the screen at all
 * times while never being big enough to read; here it is a fixed-height card that
 * opens fullscreen when the parent actually wants the map.
 */
export function HistoryMapCard({
  events,
  onExpand,
  onSelectEvent,
  selectedEventId,
}: HistoryMapCardProps) {
  return (
    <View style={styles.card}>
      {/* Non-interactive inside the page so the map never steals the page scroll. */}
      <View pointerEvents="none" style={styles.mapLayer}>
        <HistoryMap
          bottomOverlayHeight={0}
          events={events}
          interactive={false}
          onMapPress={onExpand}
          onSelectEvent={onSelectEvent}
          selectedEventId={selectedEventId}
        />
      </View>

      <Pressable
        accessibilityHint="Opens the full map for this day"
        accessibilityLabel="Day route map"
        accessibilityRole="button"
        onPress={onExpand}
        style={({ pressed }) => [styles.overlay, pressed && styles.pressed]}>
        <View style={styles.expandChip}>
          <AppIcon color={styles.expandIcon.color} name="target" size={14} />
          <Text style={styles.expandLabel}>Open map</Text>
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create(theme => ({
  card: {
    height: MAP_CARD_HEIGHT,
    marginTop: theme.spacing[4],
    marginHorizontal: theme.spacing[5],
    borderRadius: theme.radius.card,
    borderWidth: 1,
    borderColor: theme.colors.chrome.cardBorder,
    backgroundColor: theme.colors.map,
    overflow: 'hidden',
    ...theme.shadows.card,
  },
  mapLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  overlay: {
    flex: 1,
    alignItems: 'flex-end',
    justifyContent: 'flex-start',
    padding: theme.spacing[3],
  },
  expandChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: 7,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.colors.chrome.cardBorder,
    backgroundColor: theme.colors.surface,
    ...theme.shadows.card,
  },
  expandIcon: {
    color: theme.colors.icon,
  },
  expandLabel: {
    color: theme.colors.text,
    fontFamily: theme.typography.family.body,
    ...theme.typography.text.meta,
    fontWeight: theme.typography.weight.semibold,
  },
  pressed: {
    opacity: theme.colors.button.pressedOpacity,
  },
}));
