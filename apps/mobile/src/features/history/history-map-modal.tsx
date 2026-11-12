import type { ChildHistoryEventDto } from '@stepwhere/types';

import React from 'react';
import { Modal, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { AppIcon } from '@/components/ui/app-icon';
import { IconButton } from '@/components/ui/icon-button';

import {
  buildStayNumbers,
  getHistoryEventColor,
  getHistoryEventIcon,
  getHistoryEventSoftColor,
} from './history-event-visuals';
import {
  formatEventTime,
  getEventSubtitle,
  getEventTitle,
  getEventTrailingMetric,
} from './history-formatters';
import { HistoryMap } from './history-map';

const PEEK_HEIGHT = 132;

type HistoryMapModalProps = {
  dateLabel: string;
  events: ChildHistoryEventDto[];
  onClose: () => void;
  onSelectEventId: (eventId: string | null) => void;
  selectedEventId: string | null;
  visible: boolean;
};

/**
 * The map's real home. Fullscreen, with a peek card and a prev/next stepper so a
 * parent can walk the day event by event without losing the map.
 */
export function HistoryMapModal({
  dateLabel,
  events,
  onClose,
  onSelectEventId,
  selectedEventId,
  visible,
}: HistoryMapModalProps) {
  const insets = useSafeAreaInsets();
  const { theme } = useUnistyles();
  const stayNumbers = React.useMemo(() => buildStayNumbers(events), [events]);
  const selectedIndex = selectedEventId
    ? events.findIndex(event => event.id === selectedEventId)
    : -1;
  const selectedEvent = selectedIndex >= 0 ? events[selectedIndex]! : null;

  function step(offset: number) {
    if (events.length === 0) {
      return;
    }

    const nextIndex = selectedIndex < 0
      ? (offset > 0 ? 0 : events.length - 1)
      : selectedIndex + offset;

    const next = events[nextIndex];

    if (next) {
      onSelectEventId(next.id);
    }
  }

  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="overFullScreen"
      statusBarTranslucent
      visible={visible}>
      <View style={styles.container}>
        <HistoryMap
          bottomOverlayHeight={selectedEvent ? PEEK_HEIGHT + insets.bottom : insets.bottom + 24}
          events={events}
          onMapPress={() => onSelectEventId(null)}
          onSelectEvent={event => onSelectEventId(event.id)}
          selectedEventId={selectedEventId}
        />

        <View pointerEvents="box-none" style={styles.header(insets.top)}>
          <IconButton accessibilityLabel="Close map" icon="close" onPress={onClose} />
          <View style={styles.headerTitleWrap}>
            <Text numberOfLines={1} style={styles.headerTitle}>{dateLabel}</Text>
            <Text style={styles.headerSubtitle}>
              {events.length} {events.length === 1 ? 'event' : 'events'}
            </Text>
          </View>
          <View style={styles.headerSpacer} />
        </View>

        <View pointerEvents="box-none" style={styles.footer(Math.max(insets.bottom, 12))}>
          {selectedEvent ? (
            <View style={styles.peekCard}>
              <View
                style={[
                  styles.peekIcon,
                  { backgroundColor: getHistoryEventSoftColor(theme, selectedEvent.kind, true) },
                ]}>
                <AppIcon
                  color={getHistoryEventColor(theme, selectedEvent.kind, true)}
                  name={getHistoryEventIcon(selectedEvent)}
                  size={18}
                />
                {stayNumbers.has(selectedEvent.id) ? (
                  <View style={styles.peekBadge}>
                    <Text style={styles.peekBadgeText}>{stayNumbers.get(selectedEvent.id)}</Text>
                  </View>
                ) : null}
              </View>
              <View style={styles.peekCopy}>
                <Text numberOfLines={1} style={styles.peekTitle}>{getEventTitle(selectedEvent)}</Text>
                <Text numberOfLines={1} style={styles.peekMeta}>
                  {formatEventTime(selectedEvent.displayStartedAt)} · {getEventSubtitle(selectedEvent)}
                </Text>
              </View>
              <Text style={styles.peekMetric}>{getEventTrailingMetric(selectedEvent)}</Text>
            </View>
          ) : (
            <View style={styles.peekCard}>
              <Text style={styles.peekHint}>Tap a pin, or step through the day below.</Text>
            </View>
          )}

          <View style={styles.stepperRow}>
            <IconButton
              accessibilityLabel="Previous event"
              disabled={events.length === 0 || selectedIndex === 0}
              icon="chevron-left"
              onPress={() => step(-1)}
            />
            <View style={styles.stepperCount}>
              <Text style={styles.stepperCountText}>
                {selectedIndex >= 0 ? `${selectedIndex + 1} / ${events.length}` : `${events.length} events`}
              </Text>
            </View>
            <IconButton
              accessibilityLabel="Next event"
              disabled={events.length === 0 || selectedIndex === events.length - 1}
              icon="chevron-right"
              onPress={() => step(1)}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create(theme => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.map,
  },
  header: (topInset: number) => ({
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[3],
    paddingTop: Math.max(topInset, 12),
    paddingHorizontal: theme.spacing[4],
    paddingBottom: theme.spacing[3],
  }),
  headerTitleWrap: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    color: theme.colors.text,
    fontFamily: theme.typography.family.body,
    ...theme.typography.text.bodyLarge,
    fontWeight: theme.typography.weight.semibold,
  },
  headerSubtitle: {
    color: theme.colors.textMuted,
    fontFamily: theme.typography.family.body,
    ...theme.typography.text.caption,
  },
  // Balances the close button so the title stays optically centred.
  headerSpacer: {
    width: 44,
  },
  footer: (bottomInset: number) => ({
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    gap: theme.spacing[3],
    paddingHorizontal: theme.spacing[4],
    paddingBottom: bottomInset,
  }),
  peekCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[3],
    minHeight: 64,
    padding: theme.spacing[3],
    borderRadius: theme.radius.card,
    borderWidth: 1,
    borderColor: theme.colors.chrome.cardBorder,
    backgroundColor: theme.colors.surface,
    ...theme.shadows.floating,
  },
  peekIcon: {
    width: 36,
    height: 36,
    borderRadius: theme.radius.cardSmall,
    alignItems: 'center',
    justifyContent: 'center',
  },
  peekBadge: {
    position: 'absolute',
    right: -5,
    bottom: -5,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 3,
    borderRadius: theme.radius.circle,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.colors.chrome.cardBorder,
    backgroundColor: theme.colors.surface,
  },
  peekBadgeText: {
    color: theme.colors.text,
    fontFamily: theme.typography.family.body,
    fontSize: 9,
    lineHeight: 11,
    fontWeight: theme.typography.weight.bold,
    ...theme.typography.tabular,
  },
  peekCopy: {
    flex: 1,
    gap: 2,
  },
  peekTitle: {
    color: theme.colors.text,
    fontFamily: theme.typography.family.body,
    ...theme.typography.text.bodyLarge,
    fontWeight: theme.typography.weight.semibold,
  },
  peekMeta: {
    color: theme.colors.textSecondary,
    fontFamily: theme.typography.family.body,
    ...theme.typography.text.meta,
  },
  peekMetric: {
    color: theme.colors.text,
    fontFamily: theme.typography.family.body,
    ...theme.typography.text.body,
    ...theme.typography.tabular,
    fontWeight: theme.typography.weight.semibold,
  },
  peekHint: {
    flex: 1,
    color: theme.colors.textSecondary,
    fontFamily: theme.typography.family.body,
    ...theme.typography.text.meta,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[3],
  },
  stepperCount: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius.button,
    borderWidth: 1,
    borderColor: theme.colors.chrome.cardBorder,
    backgroundColor: theme.colors.surface,
    ...theme.shadows.card,
  },
  stepperCountText: {
    color: theme.colors.textSecondary,
    fontFamily: theme.typography.family.body,
    ...theme.typography.text.meta,
    ...theme.typography.tabular,
    fontWeight: theme.typography.weight.semibold,
  },
}));
