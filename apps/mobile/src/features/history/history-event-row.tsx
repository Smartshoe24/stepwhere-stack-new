import type { ChildHistoryEventDto } from '@stepwhere/types';

import React from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { AppIcon } from '@/components/ui/app-icon';

import {
  getHistoryEventColor,
  getHistoryEventIcon,
  getHistoryEventSoftColor,
} from './history-event-visuals';
import {
  formatDistance,
  formatDuration,
  formatMode,
  getEventAccessibilityLabel,
  getEventTitle,
  getEventTrailingMetric,
  splitEventTime,
} from './history-formatters';

const TIME_GUTTER_WIDTH = 56;
const RAIL_WIDTH = 28;

type HistoryEventRowProps = {
  event: ChildHistoryEventDto;
  isFirst: boolean;
  isLast: boolean;
  selected: boolean;
  stayNumber: number | null;
  onPress: () => void;
};

/**
 * Hybrid rail + card. The rail runs continuously down the left so the day reads
 * as one chronology; stays are cards (anchors, where the child was) while trips
 * and gaps are lighter rail segments (transitions between anchors). Visual weight
 * is proportional to meaning.
 */
export function HistoryEventRow(props: HistoryEventRowProps) {
  if (props.event.kind === 'stay') {
    return <StayRow {...props} />;
  }

  return <TransitionRow {...props} />;
}

function StayRow({ event, isFirst, isLast, selected, stayNumber, onPress }: HistoryEventRowProps) {
  const { theme } = useUnistyles();
  const accent = getHistoryEventColor(theme, event.kind, selected);
  const soft = getHistoryEventSoftColor(theme, event.kind, selected);
  const { time, period } = splitEventTime(event.displayStartedAt);
  const isOngoing = event.status === 'ongoing';
  const isPendingPlace = event.kind === 'stay' && event.place.enrichmentStatus === 'pending';

  return (
    <View style={styles.row}>
      <TimeGutter event={event} period={period} time={time} />

      <View style={styles.rail}>
        <View style={[styles.railLine, isFirst && styles.railLineHidden]} />
        <View style={[styles.node, { backgroundColor: accent }]} />
        <View style={[styles.railLine, styles.railLineGrow, isLast && styles.railLineHidden]} />
      </View>

      <Pressable
        accessibilityLabel={getEventAccessibilityLabel(event)}
        accessibilityRole="button"
        accessibilityState={{ selected }}
        onPress={onPress}
        style={({ pressed }) => [
          styles.card,
          selected && styles.cardSelected(accent),
          pressed && styles.pressed,
        ]}>
        <View style={[styles.iconChip, { backgroundColor: soft }]}>
          <AppIcon color={accent} name={getHistoryEventIcon(event)} size={18} />
          {stayNumber !== null ? (
            <View style={[styles.stayBadge, { borderColor: accent }]}>
              <Text style={[styles.stayBadgeText, { color: accent }]}>{stayNumber}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.cardCopy}>
          <Text
            numberOfLines={1}
            style={[styles.cardTitle, isPendingPlace && styles.cardTitlePending]}>
            {isPendingPlace ? 'Finding place name…' : getEventTitle(event)}
          </Text>
          <View style={styles.metaRow}>
            {isOngoing ? <LivePulse color={theme.colors.history.selected} /> : null}
            <Text numberOfLines={1} style={styles.cardMeta}>
              {isOngoing ? 'Still here' : 'Stay'}
            </Text>
          </View>
          {event.geofenceEvents.length > 0 ? (
            <GeofenceBadges event={event} />
          ) : null}
        </View>

        <Text style={styles.trailingMetric}>{getEventTrailingMetric(event)}</Text>
      </Pressable>
    </View>
  );
}

/**
 * Trips and gaps sit at roughly 60% of a stay's vertical weight: no card, no
 * title row, one inline meta line against the rail.
 */
function TransitionRow({ event, isFirst, isLast, selected, onPress }: HistoryEventRowProps) {
  const { theme } = useUnistyles();
  const accent = getHistoryEventColor(theme, event.kind, selected);
  const isGap = event.kind === 'gap';
  const { time, period } = splitEventTime(event.displayStartedAt);

  return (
    <View style={styles.transitionRow}>
      <TimeGutter event={event} muted period={period} time={time} />

      <View style={styles.rail}>
        {isGap ? (
          <DottedRail color={accent} hidden={isFirst || isLast} />
        ) : (
          <View
            style={[
              styles.railLine,
              styles.railLineGrow,
              { backgroundColor: accent },
              (isFirst || isLast) && styles.railLineHidden,
            ]}
          />
        )}
      </View>

      <Pressable
        accessibilityLabel={getEventAccessibilityLabel(event)}
        accessibilityRole="button"
        accessibilityState={{ selected }}
        onPress={onPress}
        style={({ pressed }) => [
          styles.transitionBody,
          selected && styles.transitionBodySelected(accent),
          pressed && styles.pressed,
        ]}>
        <AppIcon color={accent} name={getHistoryEventIcon(event)} size={14} />
        <Text numberOfLines={1} style={[styles.transitionLabel, isGap && styles.transitionLabelGap]}>
          {event.kind === 'trip'
            ? `${formatMode(event.mode)} · ${formatDistance(event.distanceMeters)}`
            : getEventTitle(event)}
        </Text>
        <Text style={styles.transitionMetric}>
          {event.status === 'ongoing' ? 'Now' : formatDuration(event.clippedDurationSeconds)}
        </Text>
      </Pressable>
    </View>
  );
}

/**
 * Stacked dots rather than `borderStyle: 'dashed'`, which renders inconsistently
 * on Android when applied to a single border side.
 */
function DottedRail({ color, hidden }: { color: string; hidden: boolean }) {
  return (
    <View style={styles.dottedRail}>
      {Array.from({ length: 5 }, (_, index) => (
        <View
          key={index}
          style={[styles.dottedRailDot, { backgroundColor: hidden ? 'transparent' : color }]}
        />
      ))}
    </View>
  );
}

/**
 * Continuation is a chevron in the gutter rather than a fourth text line, which
 * keeps row heights predictable.
 */
function TimeGutter({
  event,
  muted = false,
  period,
  time,
}: {
  event: ChildHistoryEventDto;
  muted?: boolean;
  period: string | null;
  time: string;
}) {
  return (
    <View style={styles.timeGutter}>
      {event.continuesFromPreviousDay ? (
        <AppIcon color={styles.continuationIcon.color} name="chevron-up" size={12} />
      ) : null}
      <Text style={[styles.time, muted && styles.timeMuted]}>{time}</Text>
      {period ? <Text style={styles.timePeriod}>{period}</Text> : null}
      {event.continuesIntoNextDay ? (
        <AppIcon color={styles.continuationIcon.color} name="chevron-down" size={12} />
      ) : null}
    </View>
  );
}

function GeofenceBadges({ event }: { event: ChildHistoryEventDto }) {
  return (
    <View style={styles.geofenceList}>
      {event.geofenceEvents.map(geofenceEvent => {
        const breached = geofenceEvent.eventType === 'breached';

        return (
          <View key={geofenceEvent.id} style={styles.geofencePill(breached)}>
            <AppIcon
              color={styles.geofencePillIcon(breached).color}
              name={breached ? 'shield-cross' : 'shield-check'}
              size={11}
            />
            <Text numberOfLines={1} style={styles.geofencePillLabel(breached)}>
              {geofenceEvent.zoneLabel ?? geofenceEvent.label} · {geofenceEvent.displayTime}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

/** Slow breathing dot — the one motion cue that says "this is happening now". */
function LivePulse({ color }: { color: string }) {
  const progress = useSharedValue(0);

  React.useEffect(() => {
    progress.value = withRepeat(withTiming(1, { duration: 1600 }), -1, true);
  }, [progress]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: 0.35 + progress.value * 0.65,
  }));

  return <Animated.View style={[styles.liveDot, { backgroundColor: color }, animatedStyle]} />;
}

const styles = StyleSheet.create(theme => ({
  row: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  transitionRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    minHeight: 44,
  },
  timeGutter: {
    width: TIME_GUTTER_WIDTH,
    alignItems: 'flex-end',
    paddingTop: theme.spacing[4],
    paddingRight: theme.spacing[2],
  },
  time: {
    color: theme.colors.textSecondary,
    fontFamily: theme.typography.family.body,
    ...theme.typography.text.meta,
    ...theme.typography.tabular,
    fontWeight: theme.typography.weight.medium,
  },
  timeMuted: {
    color: theme.colors.textMuted,
  },
  timePeriod: {
    color: theme.colors.textMuted,
    fontFamily: theme.typography.family.body,
    ...theme.typography.text.overline,
  },
  continuationIcon: {
    color: theme.colors.textMuted,
  },
  rail: {
    width: RAIL_WIDTH,
    alignItems: 'center',
  },
  railLine: {
    width: 2,
    height: theme.spacing[4] + 4,
    borderRadius: 1,
    backgroundColor: theme.colors.history.rail,
  },
  railLineGrow: {
    flex: 1,
    height: undefined,
  },
  railLineHidden: {
    backgroundColor: 'transparent',
  },
  dottedRail: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'space-evenly',
    paddingVertical: theme.spacing[2],
  },
  dottedRailDot: {
    width: 3,
    height: 3,
    borderRadius: theme.radius.circle,
  },
  node: {
    width: 12,
    height: 12,
    borderRadius: theme.radius.circle,
    borderWidth: 3,
    borderColor: theme.colors.history.node,
  },
  card: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing[3],
    marginRight: theme.spacing[5],
    marginBottom: theme.spacing[2],
    padding: theme.spacing[3],
    borderRadius: theme.radius.cardSmall,
    borderWidth: 1,
    borderColor: theme.colors.chrome.cardBorder,
    backgroundColor: theme.colors.surface,
    ...theme.shadows.card,
  },
  cardSelected: (accent: string) => ({
    borderColor: accent,
    borderWidth: 1.5,
  }),
  iconChip: {
    width: 36,
    height: 36,
    borderRadius: theme.radius.cardSmall,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stayBadge: {
    position: 'absolute',
    right: -5,
    bottom: -5,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 3,
    borderRadius: theme.radius.circle,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surface,
  },
  stayBadgeText: {
    fontFamily: theme.typography.family.body,
    fontSize: 9,
    lineHeight: 11,
    fontWeight: theme.typography.weight.bold,
    ...theme.typography.tabular,
  },
  cardCopy: {
    flex: 1,
    gap: 3,
    paddingTop: 1,
  },
  cardTitle: {
    color: theme.colors.text,
    fontFamily: theme.typography.family.body,
    ...theme.typography.text.bodyLarge,
    fontWeight: theme.typography.weight.semibold,
  },
  cardTitlePending: {
    color: theme.colors.textMuted,
    fontWeight: theme.typography.weight.medium,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[1] + 2,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: theme.radius.circle,
  },
  cardMeta: {
    flexShrink: 1,
    color: theme.colors.textSecondary,
    fontFamily: theme.typography.family.body,
    ...theme.typography.text.meta,
  },
  trailingMetric: {
    color: theme.colors.text,
    fontFamily: theme.typography.family.body,
    ...theme.typography.text.body,
    ...theme.typography.tabular,
    fontWeight: theme.typography.weight.semibold,
    paddingTop: 1,
  },
  transitionBody: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[2],
    marginRight: theme.spacing[5],
    minHeight: 40,
    paddingHorizontal: theme.spacing[2],
    borderRadius: theme.radius.pill,
  },
  transitionBodySelected: (accent: string) => ({
    borderWidth: 1,
    borderColor: accent,
  }),
  transitionLabel: {
    flex: 1,
    color: theme.colors.textSecondary,
    fontFamily: theme.typography.family.body,
    ...theme.typography.text.meta,
    fontWeight: theme.typography.weight.medium,
  },
  transitionLabelGap: {
    color: theme.colors.textMuted,
  },
  transitionMetric: {
    color: theme.colors.textMuted,
    fontFamily: theme.typography.family.body,
    ...theme.typography.text.meta,
    ...theme.typography.tabular,
  },
  geofenceList: {
    gap: theme.spacing[1],
    marginTop: theme.spacing[1],
    alignItems: 'flex-start',
  },
  geofencePill: (breached: boolean) => ({
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    maxWidth: '100%',
    paddingHorizontal: theme.spacing[2],
    paddingVertical: 3,
    borderRadius: theme.radius.pill,
    backgroundColor: breached ? theme.status.alert.background : theme.status.safe.background,
  }),
  geofencePillIcon: (breached: boolean) => ({
    color: breached ? theme.status.alert.text : theme.status.safe.text,
  }),
  geofencePillLabel: (breached: boolean) => ({
    flexShrink: 1,
    color: breached ? theme.status.alert.text : theme.status.safe.text,
    fontFamily: theme.typography.family.body,
    ...theme.typography.text.overline,
    letterSpacing: 0.2,
    fontWeight: theme.typography.weight.medium,
  }),
  pressed: {
    opacity: theme.colors.button.pressedOpacity,
  },
}));
