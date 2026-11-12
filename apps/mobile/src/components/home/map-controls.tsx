import React from 'react';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';

import { IconButton } from '@/components/ui/icon-button';

type MapControlsProps = {
  hidden?: boolean;
  isFollowingChild?: boolean;
  isFullscreen?: boolean;
  onSharePress?: () => void;
  onTargetPress?: () => void;
  shareDisabled?: boolean;
  showShareControl?: boolean;
  topOffset: number;
};

export function MapControls({
  hidden = false,
  isFollowingChild = false,
  isFullscreen = false,
  onSharePress,
  onTargetPress,
  shareDisabled = false,
  showShareControl = true,
  topOffset,
}: MapControlsProps) {
  const { theme } = useUnistyles();
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: withTiming(hidden ? 0 : 1, { duration: 180 }),
    transform: [
      { translateX: withTiming(hidden ? 10 : 0, { duration: 180 }) },
      { translateY: withTiming(hidden ? 10 : 0, { duration: 180 }) },
    ],
  }), [hidden]);

  return (
    <Animated.View
      pointerEvents={hidden ? 'none' : 'box-none'}
      style={[styles.container(isFullscreen, topOffset), animatedStyle]}>
      <IconButton
        accessibilityLabel={isFollowingChild ? 'Following child location' : 'Recenter map'}
        icon="target"
        iconColor={isFollowingChild ? theme.colors.button.iconActive : undefined}
        onPress={onTargetPress}
      />
      {showShareControl ? (
        <IconButton
          accessibilityLabel="Share location"
          disabled={shareDisabled}
          icon="share"
          onPress={onSharePress}
        />
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create(theme => ({
  container: (_isFullscreen: boolean, topOffset: number) => ({
    position: 'absolute',
    top: topOffset,
    right: theme.spacing[4],
    gap: theme.spacing[3],
  }),
}));
