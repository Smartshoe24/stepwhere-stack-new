import { usePathname, useRouter } from 'expo-router';
import React from 'react';
import { type LayoutChangeEvent, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';

import { BottomNavigationItem } from '@/components/navigation/bottom-navigation-item';

type BottomNavigationBarProps = {
  bottomInset: number;
  chromeHidden?: boolean;
  hidden?: boolean;
  onLayout?: (event: LayoutChangeEvent) => void;
};

const items = [
  { href: '/home', icon: 'home' as const, label: 'Home', enabled: true },
  { href: '/activity', icon: 'activity' as const, label: 'Activity', enabled: true },
  { href: '/history', icon: 'logs' as const, label: 'History', enabled: true },
  { href: '/profile', icon: 'profile' as const, label: 'Profile', enabled: true },
];

export function BottomNavigationBar({
  bottomInset,
  chromeHidden = false,
  hidden = false,
  onLayout,
}: BottomNavigationBarProps) {
  const { theme } = useUnistyles();
  const pathname = usePathname();
  const router = useRouter();
  const [measuredHeight, setMeasuredHeight] = React.useState(72 + bottomInset);
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: withTiming(chromeHidden ? 0 : 1, { duration: chromeHidden ? 220 : 190 }),
    transform: [{
      translateY: withTiming(chromeHidden ? measuredHeight + bottomInset + 24 : 0, {
        duration: chromeHidden ? 220 : 190,
      }),
    }],
  }), [bottomInset, chromeHidden, measuredHeight]);

  if (hidden) {
    return null;
  }

  function handleLayout(event: LayoutChangeEvent) {
    const nextHeight = Math.round(event.nativeEvent.layout.height);
    setMeasuredHeight((current) => (Math.abs(current - nextHeight) >= 1 ? nextHeight : current));
    onLayout?.(event);
  }

  return (
    <Animated.View
      onLayout={handleLayout}
      pointerEvents={chromeHidden ? 'none' : 'auto'}
      style={[
        styles.container(bottomInset),
        {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.chrome.navBorder,
        },
        animatedStyle,
      ]}>
      <View style={styles.itemsRow}>
        {items.map(item => (
          <BottomNavigationItem
            key={item.href}
            active={item.enabled && pathname === item.href}
            disabled={!item.enabled}
            icon={item.icon}
            label={item.label}
            onPress={item.enabled ? () => router.push(item.href as never) : undefined}
          />
        ))}
      </View>
      <Text style={[styles.homeIndicator, { backgroundColor: theme.colors.chrome.homeIndicator }]} />
    </Animated.View>
  );
}

const styles = StyleSheet.create(theme => ({
  container: (bottomInset: number) => ({
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: theme.spacing[2],
    paddingBottom: Math.max(bottomInset, 8),
    paddingHorizontal: theme.spacing[4],
    borderTopWidth: 1,
    ...theme.shadows.nav,
  }),
  itemsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  homeIndicator: {
    alignSelf: 'center',
    width: 132,
    height: 5,
    borderRadius: theme.radius.circle,
    marginTop: theme.spacing[2],
  },
}));
