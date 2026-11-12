import { NativeTabs } from 'expo-router/unstable-native-tabs';
import React from 'react';
import { useUnistyles } from 'react-native-unistyles';

import { nativeTabIconSources } from '@/components/navigation/native-tab-icon-sources';
import { NativeTabVisibilityProvider, useNativeTabVisibility } from '@/components/navigation/native-tab-visibility';
import { TabChromeProvider } from '@/components/layout/tab-chrome-context';

export default function TabsLayout() {
  return (
    <NativeTabVisibilityProvider>
      <TabChromeProvider>
        <TabsLayoutInner />
      </TabChromeProvider>
    </NativeTabVisibilityProvider>
  );
}

function TabsLayoutInner() {
  const { rt, theme } = useUnistyles();
  const { hidden } = useNativeTabVisibility();
  const nativeColorScheme = rt.themeName === 'dark' ? 'dark' : 'light';

  React.useEffect(() => {
    if (__DEV__) {
      console.info('[tabs] native colors', {
        colorScheme: nativeColorScheme,
        navActive: theme.colors.navActive,
        navIndicator: theme.colors.navIndicator,
        navRipple: theme.colors.navRipple,
        surface: theme.colors.surface,
        background: theme.colors.background,
        tabShadow: theme.colors.chrome.cardBorder,
      });
    }
  }, [nativeColorScheme, theme.colors.background, theme.colors.chrome.cardBorder, theme.colors.navActive, theme.colors.navIndicator, theme.colors.navRipple, theme.colors.surface]);

  return (
    <NativeTabs
      hidden={hidden}
      backgroundColor={theme.colors.surface}
      blurEffect="none"
      disableTransparentOnScrollEdge
      indicatorColor={theme.colors.navIndicator}
      rippleColor={theme.colors.navRipple}
      shadowColor={theme.colors.chrome.cardBorder}
      unstable_nativeProps={{
        colorScheme: nativeColorScheme,
        nativeContainerStyle: {
          backgroundColor: theme.colors.surface,
        },
      }}
      iconColor={{
        default: theme.colors.navInactive,
        selected: theme.colors.navActive,
      }}
      labelStyle={{
        default: {
          color: theme.colors.navInactive,
          fontFamily: theme.typography.family.body,
          fontSize: theme.typography.size.navLabel,
          fontWeight: theme.typography.weight.medium,
        },
        selected: {
          color: theme.colors.navActive,
          fontFamily: theme.typography.family.body,
          fontSize: theme.typography.size.navLabel,
          fontWeight: theme.typography.weight.medium,
        },
      }}
      labelVisibilityMode="labeled"
      tintColor={theme.colors.navActive}
    >
      <NativeTabs.Trigger
        name="home"
        contentStyle={{
          backgroundColor: theme.colors.background,
        }}
        disablePopToTop
        disableTransparentOnScrollEdge
        rippleColor={theme.colors.navRipple}>
        <NativeTabs.Trigger.Icon src={nativeTabIconSources.home} />
        <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger
        name="activity"
        contentStyle={{
          backgroundColor: theme.colors.background,
        }}
        disablePopToTop
        disableTransparentOnScrollEdge
        rippleColor={theme.colors.navRipple}>
        <NativeTabs.Trigger.Icon src={nativeTabIconSources.activity} />
        <NativeTabs.Trigger.Label>Activity</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger
        name="history"
        contentStyle={{
          backgroundColor: theme.colors.background,
        }}
        disablePopToTop
        disableTransparentOnScrollEdge
        rippleColor={theme.colors.navRipple}>
        <NativeTabs.Trigger.Icon src={nativeTabIconSources.logs} />
        <NativeTabs.Trigger.Label>History</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger
        name="profile"
        contentStyle={{
          backgroundColor: theme.colors.background,
        }}
        disablePopToTop
        disableTransparentOnScrollEdge
        rippleColor={theme.colors.navRipple}>
        <NativeTabs.Trigger.Icon src={nativeTabIconSources.profile} />
        <NativeTabs.Trigger.Label>Profile</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
