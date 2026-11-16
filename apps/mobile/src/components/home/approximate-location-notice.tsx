import React from 'react';
import { ActivityIndicator, Text } from 'react-native';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { StyleSheet } from 'react-native-unistyles';

type ApproximateLocationNoticeProps = {
  hidden?: boolean;
  topOffset: number;
};

/**
 * Plain-language hint shown with the accuracy circle. It deliberately avoids
 * GSM / GPS jargon: parents only need to know a sharper location is coming.
 */
function ApproximateLocationNoticeComponent({
  hidden = false,
  topOffset,
}: ApproximateLocationNoticeProps) {
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: withTiming(hidden ? 0 : 1, { duration: 180 }),
  }), [hidden]);

  return (
    <Animated.View
      accessibilityLiveRegion="polite"
      pointerEvents="none"
      style={[styles.container(topOffset), animatedStyle]}>
      <ActivityIndicator color={styles.spinner.color} size="small" />
      <Text numberOfLines={2} style={styles.label}>
        Fetching precise location…
      </Text>
    </Animated.View>
  );
}

export const ApproximateLocationNotice = React.memo(ApproximateLocationNoticeComponent);

const styles = StyleSheet.create(theme => ({
  container: (topOffset: number) => ({
    position: 'absolute',
    top: topOffset,
    left: theme.spacing[4],
    maxWidth: '68%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    borderRadius: theme.radius.button,
    borderWidth: 1,
    borderColor: theme.colors.chrome.cardBorder,
    backgroundColor: theme.colors.surface,
    ...theme.shadows.card,
  }),
  spinner: {
    color: theme.colors.primaryGreen,
  },
  label: {
    flexShrink: 1,
    color: theme.colors.text,
    fontFamily: theme.typography.family.body,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: theme.typography.weight.medium,
  },
}));
