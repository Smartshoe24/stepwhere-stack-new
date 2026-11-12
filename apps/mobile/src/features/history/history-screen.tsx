import type { ChildHistoryEventDto } from '@stepwhere/types';

import React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  type LayoutChangeEvent,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { BlurTargetView } from 'expo-blur';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { AppTabChrome } from '@/components/layout/app-child-top-chrome';
import { useTabChrome } from '@/components/layout/tab-chrome-context';
import { FirstLocationGate } from '@/components/location/first-location-gate';
import { useNativeTabVisibility } from '@/components/navigation/native-tab-visibility';
import { getRuntimeThemeName } from '@/components/theme/switch-runtime-theme';
import { useThemeTransition } from '@/components/theme/use-theme-transition';
import { useAuth } from '@/features/auth/use-auth';
import {
  useChildHistoryDayQuery,
  useChildHistoryRangeQuery,
} from '@/query/hooks';
import { queryKeys } from '@/query/query-keys';

import { HistoryDateControl } from './history-date-control';
import { HistoryDateSheet } from './history-date-sheet';
import { buildHistoryDaySummary } from './history-day-summary';
import { HistoryDaySummaryCard } from './history-day-summary-card';
import {
  clampDateKey,
  formatDateLabel,
  formatDateSubLabel,
  getTodayDateKey,
  shiftDateKey,
} from './history-formatters';
import { HistoryMapCard } from './history-map-card';
import { HistoryMapModal } from './history-map-modal';
import {
  HistoryEmptyState,
  HistoryErrorState,
  HistoryLoadingState,
} from './history-states';
import { HistoryTimeline } from './history-timeline';
import {
  resolveHistorySourceState,
  resolveHistoryViewState,
} from './history-view-state';
import { useHistoryRealtime } from './use-history-realtime';

const EMPTY_HISTORY_EVENTS: ChildHistoryEventDto[] = [];

export function HistoryScreen() {
  const auth = useAuth();
  const tabChrome = useTabChrome();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { rt, theme } = useUnistyles();
  const { isTransitioning, runThemeTransition, transitionTargetTheme } = useThemeTransition();
  const { setHidden } = useNativeTabVisibility();
  const insets = useSafeAreaInsets();
  const firstLocationBlurTargetRef = React.useRef<View | null>(null);
  const reconciledSourceMismatchRef = React.useRef<string | null>(null);
  const [topBarHeight, setTopBarHeight] = React.useState(insets.top + 68);
  const [childCarouselHeight, setChildCarouselHeight] = React.useState(64);
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata';
  const today = getTodayDateKey(new Date(), timezone);
  const [date, setDate] = React.useState(today);
  const [datePickerVisible, setDatePickerVisible] = React.useState(false);
  const [mapModalVisible, setMapModalVisible] = React.useState(false);
  const [selectedEventId, setSelectedEventId] = React.useState<string | null>(null);
  const [firstLocationGateVisible, setFirstLocationGateVisible] = React.useState(false);
  const overviewChildren = tabChrome.childrenData;
  const selectedChild = React.useMemo(() => {
    if (tabChrome.selectedChildId) {
      const exact = overviewChildren.find(child => child.id === tabChrome.selectedChildId);

      if (exact) {
        return exact;
      }
    }

    return overviewChildren[0] ?? null;
  }, [overviewChildren, tabChrome.selectedChildId]);
  const isWaitingForFirstLocation = Boolean(selectedChild && !selectedChild.hasLocationFix);
  const isFirstLocationGateBlocking = isWaitingForFirstLocation || firstLocationGateVisible;
  const rangeQuery = useChildHistoryRangeQuery({
    childId: selectedChild?.id ?? null,
    timezone,
    enabled: Boolean(selectedChild && !isWaitingForFirstLocation),
  });
  const historyQuery = useChildHistoryDayQuery({
    childId: selectedChild?.id ?? null,
    date,
    timezone,
    enabled: Boolean(selectedChild && !isWaitingForFirstLocation),
  });
  useHistoryRealtime({
    childId: selectedChild?.id ?? null,
    enabled: Boolean(selectedChild && !isWaitingForFirstLocation),
    isLive: date === today,
    timezone,
  });
  const themeName = rt.themeName === 'dark' ? 'dark' : 'light';
  const statusBarThemeName = isTransitioning ? transitionTargetTheme ?? themeName : themeName;
  const firstDate = rangeQuery.data?.firstDate ?? null;
  const maxDate = rangeQuery.data?.today ?? today;
  const sourceState = resolveHistorySourceState({
    dayDataSource: historyQuery.data?.dataSource,
    rangeDataSource: rangeQuery.data?.dataSource,
  });
  const events = React.useMemo(() => historyQuery.data?.events ?? [], [historyQuery.data?.events]);
  const queryError = historyQuery.error ?? rangeQuery.error;
  const errorMessage = queryError instanceof Error
    ? queryError.message
    : queryError
      ? 'History could not be loaded.'
      : null;
  const viewState = resolveHistoryViewState({
    hasChild: Boolean(selectedChild),
    isLoading: (rangeQuery.isPending && !rangeQuery.data)
      || (historyQuery.isPending && !historyQuery.data),
    errorMessage,
    sourceState,
    hasHistoryRange: Boolean(firstDate),
    events,
    lastDataDate: rangeQuery.data?.lastDataDate ?? null,
    selectedDate: date,
  });
  const visibleEvents = viewState.kind === 'ready'
    ? viewState.events
    : EMPTY_HISTORY_EVENTS;
  const summary = buildHistoryDaySummary({
    events: visibleEvents,
    dateKey: date,
    now: date === today ? new Date() : null,
  });
  const dateLabel = formatDateLabel(date, today);
  const effectiveSelectedEventId = selectedEventId
    && visibleEvents.some(event => event.id === selectedEventId)
    ? selectedEventId
    : null;

  React.useEffect(() => {
    setHidden(false);
  }, [setHidden]);

  React.useEffect(() => {
    if (sourceState.kind !== 'mismatch' || !selectedChild) {
      reconciledSourceMismatchRef.current = null;
      return;
    }

    const mismatchKey = [
      selectedChild.id,
      timezone,
      rangeQuery.data?.dataSource,
      historyQuery.data?.dataSource,
    ].join(':');

    if (reconciledSourceMismatchRef.current === mismatchKey) {
      return;
    }

    reconciledSourceMismatchRef.current = mismatchKey;
    void queryClient.invalidateQueries({
      queryKey: queryKeys.childHistory(selectedChild.id, timezone),
    });
  }, [
    historyQuery.data?.dataSource,
    queryClient,
    rangeQuery.data?.dataSource,
    selectedChild,
    sourceState.kind,
    timezone,
  ]);

  async function handleThemeToggle(origin: { x: number; y: number }) {
    await runThemeTransition({
      origin,
      targetTheme: getRuntimeThemeName() === 'dark' ? 'light' : 'dark',
    });
  }

  // Selecting no longer tears the timeline down; it toggles a highlight in place.
  function handleSelectEvent(event: ChildHistoryEventDto) {
    setSelectedEventId(current => (current === event.id ? null : event.id));
  }

  function goToDate(nextDate: string) {
    setDate(clampDateKey(nextDate, firstDate, maxDate));
    setSelectedEventId(null);
  }

  function handleTopBarLayout(event: LayoutChangeEvent) {
    setTopBarHeight(Math.round(event.nativeEvent.layout.height));
  }

  function handleChildCarouselLayout(event: LayoutChangeEvent) {
    setChildCarouselHeight(Math.round(event.nativeEvent.layout.height));
  }

  return (
    <SafeAreaView edges={[]} style={styles.safeArea}>
      <StatusBar style={statusBarThemeName === 'dark' ? 'light' : 'dark'} />
      <View style={styles.container}>
        <BlurTargetView
          accessibilityElementsHidden={isFirstLocationGateBlocking}
          importantForAccessibility={
            isFirstLocationGateBlocking ? 'no-hide-descendants' : 'auto'
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
            refreshControl={selectedChild ? (
              <RefreshControl
                onRefresh={() => {
                  void Promise.all([rangeQuery.refetch(), historyQuery.refetch()]);
                }}
                refreshing={rangeQuery.isRefetching || historyQuery.isRefetching}
                tintColor={theme.colors.navActive}
              />
            ) : undefined}
            showsVerticalScrollIndicator={false}
            style={styles.scroll}
          >
            <View style={styles.header}>
              <Text style={styles.headerTitle}>History</Text>
            </View>

            {selectedChild ? (
              <HistoryDateControl
                canGoNext={date < maxDate}
                canGoPrevious={Boolean(firstDate && date > firstDate)}
                isToday={date === today}
                label={dateLabel}
                onNext={() => goToDate(shiftDateKey(date, 1))}
                onOpenPicker={() => setDatePickerVisible(true)}
                onPrevious={() => goToDate(shiftDateKey(date, -1))}
                onToday={() => goToDate(today)}
                showSampleDataBadge={Boolean(
                  __DEV__
                  && sourceState.kind === 'ready'
                  && sourceState.dataSource === 'fixture'
                  && !queryError
                )}
                subLabel={formatDateSubLabel(date)}
              />
            ) : null}

            {viewState.kind === 'no-child' ? (
              <HistoryEmptyState
                action={auth.user?.family.permissions.canManageChildren ? {
                  label: 'Add a child',
                  onPress: () => router.push('/add-child/details'),
                } : undefined}
                body="Once a child is connected, their day will show up here."
                icon="children"
                title="No child connected"
              />
            ) : null}

            {viewState.kind === 'loading' ? <HistoryLoadingState /> : null}

            {viewState.kind === 'error' ? (
              <HistoryErrorState
                message={viewState.message}
                onRetry={() => {
                  void Promise.all([rangeQuery.refetch(), historyQuery.refetch()]);
                }}
              />
            ) : null}

            {viewState.kind === 'no-history' ? (
              <HistoryEmptyState
                body={`Once ${selectedChild?.name ?? 'your child'}’s tracker records location data, stops and journeys will show up here.`}
                icon="shoe"
                title="No history recorded yet"
              />
            ) : null}

            {viewState.kind === 'empty-day' ? (
              <HistoryEmptyState
                action={viewState.lastDataDate ? {
                  label: `Go to ${formatDateLabel(viewState.lastDataDate, today)}`,
                  onPress: () => goToDate(viewState.lastDataDate!),
                } : undefined}
                body={`Nothing was recorded on ${formatDateSubLabel(date)}. The tracker may have been off or out of signal.`}
                icon="calendar"
                title="Nothing recorded"
              />
            ) : null}

            {viewState.kind === 'ready' ? (
              <>
                <HistoryDaySummaryCard
                  onSelectEventId={setSelectedEventId}
                  selectedEventId={effectiveSelectedEventId}
                  summary={summary}
                />
                <HistoryMapCard
                  events={viewState.events}
                  onExpand={() => setMapModalVisible(true)}
                  onSelectEvent={handleSelectEvent}
                  selectedEventId={effectiveSelectedEventId}
                />
                <HistoryTimeline
                  events={viewState.events}
                  isProcessing={Boolean(historyQuery.data?.isProcessing)}
                  onSelectEvent={handleSelectEvent}
                  selectedEventId={effectiveSelectedEventId}
                />
              </>
            ) : null}
          </ScrollView>
        </BlurTargetView>

        {selectedChild ? (
          <FirstLocationGate
            blurTarget={firstLocationBlurTargetRef}
            childId={selectedChild.id}
            childName={selectedChild.name}
            gsmConnected={selectedChild.connectivity.gsmState === 'connected'}
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
                router.push('/add-child/details');
              }
            }}
            onCarouselLayout={handleChildCarouselLayout}
            onChildPress={() => {
              setDate(today);
              setSelectedEventId(null);
            }}
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
        <HistoryDateSheet
          maximumDate={maxDate}
          minimumDate={firstDate}
          onClose={() => setDatePickerVisible(false)}
          onSelectDate={goToDate}
          value={date}
          visible={datePickerVisible}
        />
      ) : null}

      <HistoryMapModal
        dateLabel={dateLabel}
        events={visibleEvents}
        onClose={() => setMapModalVisible(false)}
        onSelectEventId={setSelectedEventId}
        selectedEventId={effectiveSelectedEventId}
        visible={mapModalVisible && viewState.kind === 'ready'}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create(theme => ({
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
    position: 'absolute',
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
  header: {
    marginTop: theme.spacing[4],
    marginHorizontal: theme.spacing[5],
  },
  headerTitle: {
    color: theme.colors.text,
    fontFamily: theme.typography.family.display,
    ...theme.typography.text.display,
    fontWeight: theme.typography.weight.bold,
  },
}));
