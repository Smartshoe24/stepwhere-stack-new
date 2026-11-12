import React, { useEffect } from 'react';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { AppIcon } from '@/components/ui/app-icon';

type AnimatedThemeIconProps = {
  animated?: boolean;
  themeName: 'light' | 'dark';
  size?: number;
};

export function AnimatedThemeIcon({
  animated = true,
  themeName,
  size = 22,
}: AnimatedThemeIconProps) {
  const progress = useSharedValue(themeName === 'dark' ? 1 : 0);

  useEffect(() => {
    if (!animated) {
      progress.value = themeName === 'dark' ? 1 : 0;
      return;
    }

    progress.value = withTiming(themeName === 'dark' ? 1 : 0, { duration: 260 });
  }, [animated, progress, themeName]);

  const sunStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 1], [1, 0]),
    transform: [
      { rotate: `${interpolate(progress.value, [0, 1], [0, 120])}deg` },
      { scale: interpolate(progress.value, [0, 1], [1, 0.78]) },
    ],
  }));

  const moonStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 1], [0, 1]),
    transform: [
      { rotate: `${interpolate(progress.value, [0, 1], [-90, 0])}deg` },
      { scale: interpolate(progress.value, [0, 1], [0.72, 1]) },
    ],
  }));

  return (
    <>
      <Animated.View style={[styles.iconLayer(size), sunStyle]}>
        <AppIcon color="#F59E0B" name="sun" size={size} />
      </Animated.View>
      <Animated.View style={[styles.iconLayer(size), moonStyle]}>
        <AppIcon color="#7CB7FF" name="moon" size={size} />
      </Animated.View>
    </>
  );
}

const styles = {
  iconLayer: (size: number) => ({
    position: 'absolute' as const,
    width: size,
    height: size,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  }),
};
