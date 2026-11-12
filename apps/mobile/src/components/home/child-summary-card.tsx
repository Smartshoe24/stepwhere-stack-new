import React from 'react';
import { type LayoutChangeEvent, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';

import type { Child } from '@/data/children';
import { Avatar } from '@/components/ui/avatar';
import { StatusDot } from '@/components/ui/status-dot';
import { StatusPill } from '@/components/ui/status-pill';

type ChildSummaryCardProps = {
  bottomOffset: number;
  chromeHidden?: boolean;
  child: Child;
  onLayout?: (event: LayoutChangeEvent) => void;
};

export function ChildSummaryCard({
  bottomOffset,
  chromeHidden = false,
  child,
  onLayout,
}: ChildSummaryCardProps) {
  const { theme } = useUnistyles();
  const [measuredHeight, setMeasuredHeight] = React.useState(76);
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: withTiming(chromeHidden ? 0 : 1, { duration: chromeHidden ? 220 : 190 }),
    transform: [{
      translateY: withTiming(chromeHidden ? bottomOffset + measuredHeight + 32 : 0, {
        duration: chromeHidden ? 220 : 190,
      }),
    }],
  }), [bottomOffset, chromeHidden, measuredHeight]);

  function handleLayout(event: LayoutChangeEvent) {
    setMeasuredHeight(event.nativeEvent.layout.height);
    onLayout?.(event);
  }

  return (
    <Animated.View
      onLayout={handleLayout}
      pointerEvents={chromeHidden ? 'none' : 'auto'}
      style={[styles.container(bottomOffset), animatedStyle]}>
      <Avatar
        backgroundColor={theme.colors.avatar.tones[child.avatarTone]}
        initials={child.initials}
        ringColor={theme.status[child.status].border}
        size={46}
        textSize={14}
      />
      <View style={styles.textBlock}>
        <View style={styles.row}>
          <Text style={styles.name}>{child.name}</Text>
          <StatusPill label={child.statusLabel} status={child.status} />
          <StatusDot size={6} status={child.status} />
        </View>
        <Text style={styles.meta}>{`Last updated: ${child.lastUpdated}`}</Text>
      </View>
      <View style={styles.rightMeta}>
        <Text style={styles.eta}>{child.etaLabel}</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create(theme => ({
  container: (bottomOffset: number) => ({
    position: 'absolute',
    left: theme.spacing[4],
    right: theme.spacing[4],
    bottom: bottomOffset,
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[3],
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: theme.radius.card,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.chrome.cardBorder,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 24,
    elevation: 8,
  }),
  textBlock: {
    flex: 1,
    gap: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  name: {
    color: theme.colors.text,
    fontFamily: theme.typography.family.display,
    fontSize: theme.typography.size.summaryName,
    fontWeight: theme.typography.weight.medium,
    lineHeight: 18,
  },
  meta: {
    color: theme.colors.textMuted,
    fontFamily: theme.typography.family.body,
    fontSize: theme.typography.size.summaryMeta,
    lineHeight: 14,
    fontWeight: theme.typography.weight.regular,
  },
  rightMeta: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 44,
  },
  eta: {
    color: theme.colors.textMuted,
    fontFamily: theme.typography.family.body,
    fontSize: 10,
    lineHeight: 12,
    fontWeight: theme.typography.weight.medium,
    textTransform: 'uppercase',
  },
}));
