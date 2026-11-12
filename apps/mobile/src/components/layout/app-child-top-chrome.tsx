import React from "react";
import { type LayoutChangeEvent, View, type ViewStyle } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated from "react-native-reanimated";
import type { AnimatedStyle } from 'react-native-reanimated';
import { StyleSheet } from "react-native-unistyles";

import { ChildCarousel } from "@/components/home/child-carousel";
import {
  AppTopBar,
  type AppTopBarProps,
  type AppTopBarSecondaryAction,
} from "@/components/layout/app-top-bar";
import type { OverviewChildCard } from "@/features/overview/overview-ui";
import { useTabChrome } from '@/components/layout/tab-chrome-context';

const NOOP = () => undefined;

type AppTopChromeBarProps = Pick<
  AppTopBarProps,
  | 'animateThemeIcon'
  | 'onThemeTogglePress'
  | 'secondaryAction'
  | 'themeName'
  | 'themeToggleDisabled'
> & {
  topInset: number;
};

type AppChildCarouselChromeProps = {
  canManageChildren: boolean;
  childrenData: OverviewChildCard[];
  onAddChildPress: () => void;
  onChildPress: (childId: string) => void;
  selectedChildId: string | null;
};

type AppTabChromeProps = {
  animateThemeIcon: boolean;
  carouselHidden?: boolean;
  carouselStyle?: AnimatedStyle<ViewStyle>;
  onAddChildPress?: () => void;
  onCarouselLayout?: (event: LayoutChangeEvent) => void;
  onChildPress?: (childId: string) => void;
  onThemeTogglePress: AppTopBarProps['onThemeTogglePress'];
  onTopBarLayout?: (event: LayoutChangeEvent) => void;
  secondaryAction?: Extract<AppTopBarSecondaryAction, { kind: 'collapse' | 'none' }>;
  showCarousel: boolean;
  themeName: 'light' | 'dark';
  themeToggleDisabled: boolean;
  topInset?: number;
};

function getResolvedSelectedChildId(
  childrenData: OverviewChildCard[],
  selectedChildId: string | null,
) {
  if (selectedChildId && childrenData.some((child) => child.id === selectedChildId)) {
    return selectedChildId;
  }

  return childrenData[0]?.id ?? null;
}

function AppTopChromeBar({
  animateThemeIcon,
  onThemeTogglePress,
  secondaryAction,
  themeName,
  themeToggleDisabled,
  topInset,
}: AppTopChromeBarProps) {
  return (
    <View style={styles.topBarCard(topInset)}>
      <AppTopBar
        animateThemeIcon={animateThemeIcon}
        onThemeTogglePress={onThemeTogglePress}
        secondaryAction={secondaryAction}
        themeName={themeName}
        themeToggleDisabled={themeToggleDisabled}
      />
    </View>
  );
}

function AppChildCarouselChrome({
  canManageChildren,
  childrenData,
  onAddChildPress,
  onChildPress,
  selectedChildId,
}: AppChildCarouselChromeProps) {
  const resolvedSelectedChildId = getResolvedSelectedChildId(childrenData, selectedChildId);

  if (!resolvedSelectedChildId) {
    return null;
  }

  return (
    <View style={styles.childCarouselBand}>
      <ChildCarousel
        childrenData={childrenData}
        onAddChildPress={onAddChildPress}
        onChildPress={onChildPress}
        selectedChildId={resolvedSelectedChildId}
        showAddChildButton={canManageChildren}
      />
    </View>
  );
}

/** Canonical top chrome for every native tab. */
export function AppTabChrome({
  animateThemeIcon,
  carouselHidden = false,
  carouselStyle,
  onAddChildPress,
  onCarouselLayout,
  onChildPress,
  onThemeTogglePress,
  onTopBarLayout,
  secondaryAction,
  showCarousel,
  themeName,
  themeToggleDisabled,
  topInset,
}: AppTabChromeProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const chrome = useTabChrome();
  const selectChild = chrome.selectChild;
  const resolvedSecondaryAction: AppTopBarSecondaryAction = secondaryAction ?? {
    kind: 'bell',
    badgeLabel: chrome.unreadNotificationCount > 99
      ? '99+'
      : chrome.unreadNotificationCount > 0
        ? String(chrome.unreadNotificationCount)
        : undefined,
    onPress: () => router.push('/notifications'),
  };

  const handleChildPress = React.useCallback((childId: string) => {
    selectChild(childId);
    onChildPress?.(childId);
  }, [onChildPress, selectChild]);

  return (
    <View pointerEvents="box-none">
      <View onLayout={onTopBarLayout}>
        <AppTopChromeBar
          animateThemeIcon={animateThemeIcon}
          onThemeTogglePress={onThemeTogglePress}
          secondaryAction={resolvedSecondaryAction}
          themeName={themeName}
          themeToggleDisabled={themeToggleDisabled}
          topInset={topInset ?? insets.top}
        />
      </View>
      {showCarousel && chrome.selectedChildId ? (
        <Animated.View
          onLayout={onCarouselLayout}
          pointerEvents={carouselHidden ? 'none' : 'auto'}
          style={carouselStyle}
        >
          <AppChildCarouselChrome
            canManageChildren={chrome.canManageChildren}
            childrenData={chrome.childrenData}
            onAddChildPress={onAddChildPress ?? NOOP}
            onChildPress={handleChildPress}
            selectedChildId={chrome.selectedChildId}
          />
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  topBarCard: (topInset: number) => ({
    paddingTop: Math.max(topInset, 8) + 6,
    paddingBottom: theme.spacing[2],
    backgroundColor: theme.colors.chrome.topBarSurface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.chrome.topBarBorder,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 18,
    elevation: 3,
  }),
  childCarouselBand: {
    paddingTop: theme.spacing[2],
    paddingBottom: theme.spacing[2],
    backgroundColor: theme.colors.chrome.topBarSurface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.chrome.topBarBorder,
  },
}));
