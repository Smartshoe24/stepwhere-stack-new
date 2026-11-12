import React from 'react';
import { type LayoutChangeEvent, Pressable, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { findSegmentEventId, type HistoryCoverageSegment, type HistoryDaySummary } from './history-day-summary';
import { formatDistance, formatDuration } from './history-formatters';

const BAR_HEIGHT = 10;
const HOUR_TICKS = ['12a', '6a', '12p', '6p', '12a'];

type HistoryDaySummaryCardProps = {
  onSelectEventId: (eventId: string) => void;
  selectedEventId: string | null;
  summary: HistoryDaySummary;
};

/**
 * The screen's signature element. One 24-hour bar segmented by real elapsed time
 * answers "what shape was this day?" and "was there a data hole?" before any
 * scrolling, and doubles as a scrubber into the timeline.
 */
export function HistoryDaySummaryCard({
  onSelectEventId,
  selectedEventId,
  summary,
}: HistoryDaySummaryCardProps) {
  const { theme } = useUnistyles();
  const [barWidth, setBarWidth] = React.useState(0);

  function handleBarLayout(event: LayoutChangeEvent) {
    setBarWidth(Math.round(event.nativeEvent.layout.width));
  }

  function handleBarPress(locationX: number) {
    if (barWidth <= 0) {
      return;
    }

    const eventId = findSegmentEventId(summary.segments, locationX / barWidth);

    if (eventId) {
      onSelectEventId(eventId);
    }
  }

  const coveragePercent = Math.round(summary.coverageRatio * 100);

  return (
    <View style={styles.card}>
      <Pressable
        accessibilityHint="Tap a section to jump to that part of the day"
        accessibilityLabel={`Day coverage, ${coveragePercent} percent tracked`}
        accessibilityRole="adjustable"
        onLayout={handleBarLayout}
        onPress={pressEvent => handleBarPress(pressEvent.nativeEvent.locationX)}
        style={styles.barPressable}>
        <View style={styles.barTrack}>
          {summary.segments.map(segment => (
            <View
              key={segment.id}
              style={styles.segment(
                segment.span,
                getSegmentColor(theme, segment, segment.eventId === selectedEventId),
              )}
            />
          ))}
        </View>
      </Pressable>

      <View style={styles.tickRow}>
        {HOUR_TICKS.map((tick, index) => (
          <Text
            key={tick + index}
            style={[
              styles.tick,
              index === 0 && styles.tickFirst,
              index === HOUR_TICKS.length - 1 && styles.tickLast,
            ]}>
            {tick}
          </Text>
        ))}
      </View>

      <View style={styles.statsRow}>
        <SummaryStat
          label={summary.placeCount === 1 ? 'Place' : 'Places'}
          value={String(summary.placeCount)}
        />
        <View style={styles.statDivider} />
        <SummaryStat label="Travelled" value={formatDistance(summary.distanceMeters)} />
        <View style={styles.statDivider} />
        <SummaryStat
          label={summary.gapSeconds > 0 ? 'No data' : 'Tracked'}
          tone={summary.gapSeconds > 0 ? 'warning' : 'default'}
          value={
            summary.gapSeconds > 0
              ? formatDuration(summary.gapSeconds)
              : formatDuration(summary.trackedSeconds)
          }
        />
      </View>
    </View>
  );
}

function SummaryStat({
  label,
  tone = 'default',
  value,
}: {
  label: string;
  tone?: 'default' | 'warning';
  value: string;
}) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue(tone)}>{value}</Text>
      <Text style={styles.statLabel}>{label.toUpperCase()}</Text>
    </View>
  );
}

function getSegmentColor(
  theme: ReturnType<typeof useUnistyles>['theme'],
  segment: HistoryCoverageSegment,
  selected: boolean,
) {
  if (selected) {
    return theme.colors.history.selected;
  }

  if (segment.kind === 'stay') {
    return theme.colors.history.stay;
  }

  if (segment.kind === 'trip') {
    return theme.colors.history.trip;
  }

  if (segment.kind === 'gap') {
    return theme.colors.history.gapSoft;
  }

  return theme.colors.history.coverageTrack;
}

const styles = StyleSheet.create(theme => ({
  card: {
    marginTop: theme.spacing[4],
    marginHorizontal: theme.spacing[5],
    padding: theme.spacing[4],
    borderRadius: theme.radius.card,
    borderWidth: 1,
    borderColor: theme.colors.chrome.cardBorder,
    backgroundColor: theme.colors.surface,
    ...theme.shadows.card,
  },
  // Generous hit area around a 10px bar without inflating the visual.
  barPressable: {
    paddingVertical: theme.spacing[2],
    marginVertical: -theme.spacing[2],
    justifyContent: 'center',
  },
  barTrack: {
    flexDirection: 'row',
    height: BAR_HEIGHT,
    borderRadius: theme.radius.pill,
    overflow: 'hidden',
    backgroundColor: theme.colors.history.coverageTrack,
  },
  segment: (span: number, color: string) => ({
    flexGrow: span,
    flexShrink: 0,
    flexBasis: 0,
    backgroundColor: color,
  }),
  tickRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: theme.spacing[2],
  },
  tick: {
    flex: 1,
    textAlign: 'center',
    color: theme.colors.textMuted,
    fontFamily: theme.typography.family.body,
    ...theme.typography.text.overline,
    ...theme.typography.tabular,
  },
  tickFirst: {
    textAlign: 'left',
  },
  tickLast: {
    textAlign: 'right',
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: theme.spacing[4],
  },
  stat: {
    flex: 1,
    gap: 2,
  },
  statDivider: {
    width: 1,
    height: 28,
    marginHorizontal: theme.spacing[3],
    backgroundColor: theme.colors.divider,
  },
  statValue: (tone: 'default' | 'warning') => ({
    color: tone === 'warning' ? theme.colors.telemetry.warning : theme.colors.text,
    fontFamily: theme.typography.family.display,
    ...theme.typography.text.metric,
    ...theme.typography.tabular,
    fontWeight: theme.typography.weight.semibold,
  }),
  statLabel: {
    color: theme.colors.textMuted,
    fontFamily: theme.typography.family.body,
    ...theme.typography.text.overline,
    fontWeight: theme.typography.weight.semibold,
  },
}));
