import React from "react";
import {
  type LayoutChangeEvent,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { BlurTargetView } from "expo-blur";
import { StatusBar } from "expo-status-bar";
import { useRouter } from "expo-router";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import type { ActivityPeriod } from "@stepwhere/types";

import { AppTabChrome } from "@/components/layout/app-child-top-chrome";
import { useTabChrome } from '@/components/layout/tab-chrome-context';
import { FirstLocationGate } from "@/components/location/first-location-gate";
import { useNativeTabVisibility } from "@/components/navigation/native-tab-visibility";
import { getRuntimeThemeName } from "@/components/theme/switch-runtime-theme";
import { useThemeTransition } from "@/components/theme/use-theme-transition";
import { useAuth } from "@/features/auth/use-auth";
import { useChildActivityQuery, useOverviewQuery } from "@/query/hooks";

import { ActivityDateRangeControl } from "./activity-date-range-control";
import { ActivityDateRangeSheet } from "./activity-date-range-sheet";
import { ActivityEmptyState } from "./activity-empty-state";
import { ActivityHeader } from "./activity-header";
import { ActivityInsightBanner } from "./activity-insight-banner";
import { ActivityLoadingState } from "./activity-loading-state";
import { ActivityMetricSummary } from "./activity-metric-summary";
import { ActivityPeriodTabs } from "./activity-period-tabs";
import { ActivityRhythmChart } from "./activity-rhythm-chart";
import { hasRecordedActivity } from "./activity-live-patch";
import { useActivityRealtime } from "./use-activity-realtime";
import { canShiftActivityRangeForward, getDefaultActivityRange, getRangeLabel, getTodayDateKey, shiftActivityRange, type ActivityDateRange } from "./activity-date";

export function ActivityScreen() {
  const auth = useAuth();
  const tabChrome = useTabChrome();
  const router = useRouter();
  const { rt } = useUnistyles();
  const { isTransitioning, runThemeTransition, transitionTargetTheme } = useThemeTransition();
  const { setHidden } = useNativeTabVisibility();
  const insets = useSafeAreaInsets();
  const firstLocationBlurTargetRef = React.useRef<View | null>(null);
  const [topBarHeight, setTopBarHeight] = React.useState(insets.top + 68);
  const [childCarouselHeight, setChildCarouselHeight] = React.useState(64);
  const organizationId = auth.user?.family.organization?.id ?? null;
  const overviewQuery = useOverviewQuery(organizationId);
  const [period, setPeriod] = React.useState<ActivityPeriod>("day");
  const [range, setRange] = React.useState<ActivityDateRange>(() => getDefaultActivityRange("day"));
  const [rangeSheetVisible, setRangeSheetVisible] = React.useState(false);
  const [firstLocationGateVisible, setFirstLocationGateVisible] =
    React.useState(false);
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Kolkata";
  const overviewChildren = tabChrome.childrenData;
  const selectedChild = React.useMemo(() => {
    if (tabChrome.selectedChildId) {
      const exact = overviewChildren.find((child) => child.id === tabChrome.selectedChildId);

      if (exact) {
        return exact;
      }
    }

    return overviewChildren[0] ?? null;
  }, [overviewChildren, tabChrome.selectedChildId]);
  const isWaitingForFirstLocation = Boolean(
    selectedChild && !selectedChild.hasLocationFix,
  );
  const isFirstLocationGateBlocking =
    isWaitingForFirstLocation || firstLocationGateVisible;
  const activityQuery = useChildActivityQuery({
    childId: selectedChild?.id ?? null,
    endDate: range.endDate,
    period,
    startDate: range.startDate,
    timezone,
    enabled: Boolean(selectedChild && !isWaitingForFirstLocation),
  });
  const themeName = rt.themeName === "dark" ? "dark" : "light";
  const statusBarThemeName = isTransitioning ? transitionTargetTheme ?? themeName : themeName;
  const activityData = activityQuery.data ?? null;
  const hasActivity = activityData ? hasRecordedActivity(activityData) : false;

  // Live step patches for today's range. Historical ranges are immutable, so the
  // subscription is skipped for them.
  useActivityRealtime({
    childId: selectedChild?.id ?? null,
    enabled: Boolean(selectedChild && !isWaitingForFirstLocation),
    endDate: range.endDate,
    isLive: activityData?.isLive ?? false,
    period,
    startDate: range.startDate,
    timezone,
  });

  React.useEffect(() => {
    setHidden(false);
  }, [setHidden]);

  async function handleThemeToggle(origin: { x: number; y: number }) {
    await runThemeTransition({
      origin,
      targetTheme: getRuntimeThemeName() === "dark" ? "light" : "dark",
    });
  }

  function handleTopBarLayout(event: LayoutChangeEvent) {
    setTopBarHeight(Math.round(event.nativeEvent.layout.height));
  }

  function handleChildCarouselLayout(event: LayoutChangeEvent) {
    setChildCarouselHeight(Math.round(event.nativeEvent.layout.height));
  }

  if (overviewQuery.isPending && overviewChildren.length === 0) {
    return (
      <SafeAreaView edges={[]} style={styles.safeArea}>
        <StatusBar style={statusBarThemeName === "dark" ? "light" : "dark"} />
        <View style={styles.container}>
          <ActivityLoadingState />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={[]} style={styles.safeArea}>
      <StatusBar style={statusBarThemeName === "dark" ? "light" : "dark"} />
      <View style={styles.container}>
        <BlurTargetView
          accessibilityElementsHidden={isFirstLocationGateBlocking}
          importantForAccessibility={
            isFirstLocationGateBlocking ? "no-hide-descendants" : "auto"
          }
          ref={firstLocationBlurTargetRef}
          style={styles.blurTarget}
        >
          <View
            style={styles.topChromeSpacer(
              topBarHeight + (selectedChild ? childCarouselHeight : 0),
            )}
          />

          <ScrollView
            contentContainerStyle={styles.content(insets.bottom)}
            showsVerticalScrollIndicator={false}
            style={styles.scroll}
          >
            <ActivityHeader />
            {selectedChild ? (
              <>
                <ActivityPeriodTabs
                  onChange={(nextPeriod) => {
                    setPeriod(nextPeriod);
                    setRange(getDefaultActivityRange(nextPeriod));
                  }}
                  value={period}
                />
                <ActivityDateRangeControl
                  canGoNext={canShiftActivityRangeForward(
                    range,
                    getTodayDateKey(),
                  )}
                  label={getRangeLabel(period, range)}
                  onNext={() =>
                    setRange((current) =>
                      shiftActivityRange(current, "next", getTodayDateKey()),
                    )
                  }
                  onOpenSheet={() => setRangeSheetVisible(true)}
                  onPrevious={() =>
                    setRange((current) =>
                      shiftActivityRange(
                        current,
                        "previous",
                        getTodayDateKey(),
                      ),
                    )
                  }
                />
                {/*
                  `isPending` is exactly "no data for this range yet", which covers
                  both first load and a period/date change (the query key changes and
                  nothing is cached under the new one).
                */}
                {activityQuery.isPending ? <ActivityLoadingState /> : null}

                {activityQuery.error instanceof Error ? (
                  <View style={styles.errorBanner}>
                    <Text style={styles.errorText}>
                      {activityQuery.error.message}
                    </Text>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => {
                        void activityQuery.refetch();
                      }}
                      style={({ pressed }) => [
                        styles.retryButton,
                        pressed && styles.pressed,
                      ]}
                    >
                      <Text style={styles.retryLabel}>Try again</Text>
                    </Pressable>
                  </View>
                ) : null}

                {/*
                  Rendered whenever data exists, including during a background
                  refetch — hiding it then would blank the screen on every
                  foreground, and live patches would have nothing to update.
                */}
                {activityData ? (
                  hasActivity ? (
                    <>
                      <ActivityInsightBanner banner={activityData.insightBanner} />
                      <ActivityMetricSummary metrics={activityData.metrics} />
                      <ActivityRhythmChart buckets={activityData.rhythm} />
                    </>
                  ) : (
                    <ActivityEmptyState
                      body={`Once ${selectedChild.name}'s tracker records some movement, steps and active time will show up here.`}
                      icon="shoe"
                      title="No activity recorded yet"
                    />
                  )
                ) : null}
              </>
            ) : (
              <ActivityEmptyState
                action={auth.user?.family.permissions.canManageChildren ? {
                  label: "Add a child",
                  onPress: () => router.push("/add-child/details"),
                } : undefined}
              />
            )}
          </ScrollView>
        </BlurTargetView>

        {selectedChild ? (
          <FirstLocationGate
            blurTarget={firstLocationBlurTargetRef}
            childId={selectedChild.id}
            childName={selectedChild.name}
            gsmConnected={selectedChild.connectivity.gsmState === "connected"}
            key={selectedChild.id}
            locationReceived={selectedChild.hasLocationFix}
            onVisibilityChange={setFirstLocationGateVisible}
            protectedTopOffset={topBarHeight + childCarouselHeight}
          />
        ) : null}

        <View pointerEvents="box-none" style={styles.topBarOverlay}>
          <AppTabChrome
            animateThemeIcon={!isTransitioning}
            onAddChildPress={() => {
              if (auth.user?.family.permissions.canManageChildren) {
                router.push("/add-child/details");
              }
            }}
            onCarouselLayout={handleChildCarouselLayout}
            onThemeTogglePress={handleThemeToggle}
            onTopBarLayout={handleTopBarLayout}
            showCarousel={Boolean(selectedChild)}
            themeName={themeName}
            themeToggleDisabled={isTransitioning}
            topInset={insets.top}
          />
        </View>
      </View>
      {!isWaitingForFirstLocation ? (
        <ActivityDateRangeSheet
          onApply={(nextRange) => {
            setRange(nextRange);
            setRangeSheetVisible(false);
          }}
          onClose={() => setRangeSheetVisible(false)}
          period={period}
          value={range}
          visible={rangeSheetVisible}
        />
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create((theme) => ({
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  blurTarget: {
    flex: 1,
  },
  topChromeSpacer: (height: number) => ({
    height,
  }),
  topBarOverlay: {
    position: "absolute",
    top: 0,
    right: 0,
    left: 0,
    zIndex: 54,
  },
  scroll: {
    flex: 1,
  },
  content: (bottomInset: number) => ({
    paddingBottom: Math.max(bottomInset, 16) + 80,
  }),
  errorBanner: {
    marginHorizontal: theme.spacing[5],
    marginTop: theme.spacing[4],
    padding: theme.spacing[4],
    borderRadius: theme.radius.button,
    backgroundColor: theme.colors.alertBackground,
    gap: theme.spacing[3],
    alignItems: "flex-start",
  },
  errorText: {
    color: theme.colors.alertText,
    fontFamily: theme.typography.family.body,
    fontSize: 13,
  },
  // Neutral outlined action, matching History. A solid fill here would borrow the
  // navigation accent.
  retryButton: {
    minHeight: 40,
    justifyContent: "center",
    paddingHorizontal: theme.spacing[4],
    borderRadius: theme.radius.button,
    borderWidth: 1,
    borderColor: theme.colors.chrome.cardBorder,
    backgroundColor: theme.colors.surface,
  },
  retryLabel: {
    color: theme.colors.text,
    fontFamily: theme.typography.family.body,
    fontSize: 13,
    fontWeight: theme.typography.weight.semibold,
  },
  pressed: {
    opacity: theme.colors.button.pressedOpacity,
  },
}));
