import type { NotificationInboxItemDto } from '@stepwhere/types';
import { useQueryClient } from '@tanstack/react-query';
import { useFocusEffect, useRouter } from 'expo-router';
import React from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { Avatar } from '@/components/ui/avatar';
import { AppIcon } from '@/components/ui/app-icon';
import { useAuth } from '@/features/auth/use-auth';
import { useNotificationPermission } from '@/features/notifications/notification-provider';
import { getAvatarTone } from '@/features/overview/overview-ui';
import { useMarkAllNotificationsReadMutation, useMarkNotificationReadMutation, useNotificationsInfiniteQuery } from '@/query/hooks';
import { queryKeys } from '@/query/query-keys';

type NotificationRow =
  | { kind: 'section'; id: string; label: string }
  | { kind: 'item'; id: string; item: NotificationInboxItemDto };

function getRelativeGroupLabel(occurredAt: string) {
  const now = new Date();
  const date = new Date(occurredAt);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (target.getTime() === today.getTime()) {
    return 'Today';
  }

  if (target.getTime() === yesterday.getTime()) {
    return 'Yesterday';
  }

  return 'Earlier';
}

function formatRelativeTime(value: string) {
  const date = new Date(value);
  const deltaMs = Date.now() - date.getTime();
  const deltaMinutes = Math.max(1, Math.round(deltaMs / 60_000));

  if (deltaMinutes < 60) {
    return `${deltaMinutes}m ago`;
  }

  const deltaHours = Math.round(deltaMinutes / 60);
  if (deltaHours < 24) {
    return `${deltaHours}h ago`;
  }

  return date.toLocaleDateString();
}

function buildRows(items: NotificationInboxItemDto[]): NotificationRow[] {
  const rows: NotificationRow[] = [];
  let lastLabel: string | null = null;

  for (const item of items) {
    const label = getRelativeGroupLabel(item.occurredAt);

    if (label !== lastLabel) {
      rows.push({
        kind: 'section',
        id: `section-${label}`,
        label,
      });
      lastLabel = label;
    }

    rows.push({
      kind: 'item',
      id: item.id,
      item,
    });
  }

  return rows;
}

export default function NotificationsScreen() {
  const auth = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { theme } = useUnistyles();
  const {
    enableNotifications,
    openSystemNotificationSettings,
    permissionState,
    registrationError,
    registrationState,
    retryRegistration,
  } = useNotificationPermission();
  const notificationsQuery = useNotificationsInfiniteQuery(auth.status === 'signedIn');
  const markNotificationReadMutation = useMarkNotificationReadMutation();
  const markAllNotificationsReadMutation = useMarkAllNotificationsReadMutation();
  const items = React.useMemo<NotificationInboxItemDto[]>(
    () => notificationsQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [notificationsQuery.data?.pages],
  );
  const rows = React.useMemo(() => buildRows(items), [items]);
  const errorMessage = notificationsQuery.error instanceof Error
    ? notificationsQuery.error.message
    : null;
  const isLoading = notificationsQuery.isPending && items.length === 0;
  const isRefreshing = notificationsQuery.isRefetching && !notificationsQuery.isFetchingNextPage && items.length > 0;
  const isLoadingMore = notificationsQuery.isFetchingNextPage;
  const isMarkingAllRead = markAllNotificationsReadMutation.isPending;

  useFocusEffect(React.useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.notifications('inbox') });
  }, [queryClient]));

  async function handleOpenItem(item: NotificationInboxItemDto) {
    void markNotificationReadMutation.mutateAsync(item.id).catch(() => undefined);

    router.navigate({
      pathname: '/home',
      params: {
        childId: item.data.childId,
      },
    });
  }

  async function handleMarkAllRead() {
    try {
      await markAllNotificationsReadMutation.mutateAsync();
    } catch {}
  }

  function renderRow({ item }: { item: NotificationRow }) {
    if (item.kind === 'section') {
      return (
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionHeaderText}>{item.label}</Text>
        </View>
      );
    }

    const row = item.item;
    const iconName = row.type === 'geofence_breached' ? 'shield-cross' : 'shield-check';
    const iconColor = row.type === 'geofence_breached' ? theme.colors.alertText : theme.colors.primaryGreen;
    const avatarTone = getAvatarTone(row.child?.id ?? row.id);

    return (
      <Pressable
        onPress={() => {
          void handleOpenItem(row);
        }}
        style={({ pressed }) => [
          styles.itemRow(Boolean(row.readAt)),
          pressed && styles.itemPressed,
        ]}>
        <View style={styles.avatarWrap}>
          <Avatar
            backgroundColor={theme.colors.avatar.tones[avatarTone]}
            imageUrl={row.child?.avatarUrl}
            initials={row.child?.initials ?? 'SW'}
            size={44}
            textSize={14}
          />
          <View style={styles.avatarOverlay(iconColor)}>
            <AppIcon color="#FFFFFF" name={iconName} size={12} />
          </View>
        </View>

        <View style={styles.itemContent}>
          <View style={styles.itemTitleRow}>
            <Text numberOfLines={2} style={styles.itemTitle}>
              {row.title}
            </Text>
            {!row.readAt ? <View style={styles.unreadDot} /> : null}
          </View>
          <Text numberOfLines={2} style={styles.itemBody}>
            {row.body}
          </Text>
          <Text style={styles.itemTime}>{formatRelativeTime(row.occurredAt)}</Text>
        </View>
      </Pressable>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.headerButton, pressed && styles.itemPressed]}>
            <AppIcon color={theme.colors.text} name="arrow-left" size={18} />
          </Pressable>
          <Text style={styles.headerTitle}>Notifications</Text>
          <Pressable
            disabled={isMarkingAllRead || items.length === 0}
            onPress={() => {
              void handleMarkAllRead();
            }}
            style={({ pressed }) => [
              styles.markAllButton,
              (isMarkingAllRead || items.length === 0) && styles.disabledButton,
              pressed && styles.itemPressed,
            ]}>
            <Text style={styles.markAllLabel}>Mark all read</Text>
          </Pressable>
        </View>

        {registrationState === 'error' ? (
          <View style={styles.permissionBanner}>
            <Text style={styles.permissionText}>{registrationError}</Text>
            <Pressable onPress={() => { void retryRegistration(); }} style={({ pressed }) => [styles.permissionButton, pressed && styles.itemPressed]}>
              <Text style={styles.permissionButtonLabel}>Try again</Text>
            </Pressable>
          </View>
        ) : permissionState === 'denied' ? (
          <View style={styles.permissionBanner}>
            <Text style={styles.permissionText}>Notifications are off. Turn them on in Settings to receive safety alerts.</Text>
            <Pressable onPress={() => { void openSystemNotificationSettings(); }} style={({ pressed }) => [styles.permissionButton, pressed && styles.itemPressed]}>
              <Text style={styles.permissionButtonLabel}>Open Settings</Text>
            </Pressable>
          </View>
        ) : permissionState === 'undetermined' ? (
          <View style={styles.permissionBanner}>
            <Text style={styles.permissionText}>Turn on notifications to receive child safety alerts.</Text>
            <Pressable onPress={() => { void enableNotifications(); }} style={({ pressed }) => [styles.permissionButton, pressed && styles.itemPressed]}>
              <Text style={styles.permissionButtonLabel}>Turn on</Text>
            </Pressable>
          </View>
        ) : permissionState === 'provisional' ? (
          <View style={styles.permissionBanner}>
            <Text style={styles.permissionText}>Notifications are delivered quietly. You can allow sounds and banners in Settings.</Text>
            <Pressable onPress={() => { void openSystemNotificationSettings(); }} style={({ pressed }) => [styles.permissionButton, pressed && styles.itemPressed]}>
              <Text style={styles.permissionButtonLabel}>Settings</Text>
            </Pressable>
          </View>
        ) : registrationState === 'registering' ? (
          <View style={styles.permissionBanner}>
            <Text style={styles.permissionText}>Setting up notifications…</Text>
            <ActivityIndicator color={theme.colors.primaryGreen} size="small" />
          </View>
        ) : null}

        {isLoading ? (
          <View style={styles.centerState}>
            <ActivityIndicator color={theme.colors.primaryGreen} />
          </View>
        ) : rows.length === 0 ? (
          <View style={styles.centerState}>
            <Text style={styles.emptyTitle}>No notifications yet</Text>
            <Text style={styles.emptyBody}>Child safety updates will appear here.</Text>
          </View>
        ) : (
          <FlatList
            contentContainerStyle={styles.listContent}
            data={rows}
            keyExtractor={(item) => item.id}
            onEndReached={() => {
              if (!isLoadingMore && notificationsQuery.hasNextPage) {
                void notificationsQuery.fetchNextPage();
              }
            }}
            onEndReachedThreshold={0.3}
            refreshControl={(
              <RefreshControl
                onRefresh={() => {
                  void notificationsQuery.refetch();
                }}
                refreshing={isRefreshing}
                tintColor={theme.colors.primaryGreen}
              />
            )}
            renderItem={renderRow}
            ListFooterComponent={isLoadingMore ? <ActivityIndicator color={theme.colors.primaryGreen} /> : null}
          />
        )}

        {errorMessage ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorBannerText}>{errorMessage}</Text>
          </View>
        ) : null}
      </View>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing[4],
    paddingTop: theme.spacing[2],
    paddingBottom: theme.spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.chrome.cardBorder,
  },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: theme.radius.circle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    marginLeft: theme.spacing[2],
    color: theme.colors.text,
    fontFamily: theme.typography.family.display,
    fontSize: 18,
    lineHeight: 22,
    fontWeight: theme.typography.weight.semibold,
  },
  markAllButton: {
    minHeight: 36,
    paddingHorizontal: theme.spacing[3],
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabledButton: {
    opacity: 0.45,
  },
  markAllLabel: {
    color: theme.colors.primaryGreen,
    fontFamily: theme.typography.family.body,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: theme.typography.weight.semibold,
  },
  permissionBanner: {
    marginHorizontal: theme.spacing[4],
    marginTop: theme.spacing[3],
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[3],
    borderRadius: theme.radius.card,
    borderWidth: 1,
    borderColor: theme.colors.alertBorder,
    backgroundColor: theme.colors.alertBackground,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing[3],
  },
  permissionText: {
    flex: 1,
    color: theme.colors.alertText,
    fontFamily: theme.typography.family.body,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: theme.typography.weight.medium,
  },
  permissionButton: {
    minHeight: 34,
    paddingHorizontal: theme.spacing[3],
    borderRadius: theme.radius.button,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surface,
  },
  permissionButtonLabel: {
    color: theme.colors.text,
    fontFamily: theme.typography.family.body,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: theme.typography.weight.semibold,
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing[6],
  },
  emptyTitle: {
    color: theme.colors.text,
    fontFamily: theme.typography.family.display,
    fontSize: 18,
    lineHeight: 22,
    fontWeight: theme.typography.weight.semibold,
  },
  emptyBody: {
    marginTop: theme.spacing[2],
    color: theme.colors.textSecondary,
    textAlign: 'center',
    fontFamily: theme.typography.family.body,
    fontSize: 13,
    lineHeight: 18,
  },
  listContent: {
    paddingHorizontal: theme.spacing[4],
    paddingTop: theme.spacing[4],
    paddingBottom: theme.spacing[6],
  },
  sectionHeader: {
    paddingTop: theme.spacing[2],
    paddingBottom: theme.spacing[2],
  },
  sectionHeaderText: {
    color: theme.colors.textSecondary,
    fontFamily: theme.typography.family.body,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: theme.typography.weight.semibold,
  },
  itemRow: (isRead: boolean) => ({
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing[3],
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[3],
    borderRadius: theme.radius.card,
    backgroundColor: isRead ? 'transparent' : theme.colors.softGreen,
    marginBottom: theme.spacing[2],
  }),
  itemPressed: {
    opacity: 0.8,
  },
  avatarWrap: {
    position: 'relative',
  },
  avatarOverlay: (backgroundColor: string) => ({
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 18,
    height: 18,
    borderRadius: theme.radius.circle,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor,
    borderWidth: 1.5,
    borderColor: theme.colors.surface,
  }),
  itemContent: {
    flex: 1,
    minWidth: 0,
  },
  itemTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing[2],
  },
  itemTitle: {
    flex: 1,
    color: theme.colors.text,
    fontFamily: theme.typography.family.body,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: theme.typography.weight.semibold,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: theme.radius.circle,
    marginTop: 5,
    backgroundColor: theme.colors.alertBorder,
  },
  itemBody: {
    marginTop: 2,
    color: theme.colors.textSecondary,
    fontFamily: theme.typography.family.body,
    fontSize: 12,
    lineHeight: 17,
  },
  itemTime: {
    marginTop: theme.spacing[2],
    color: theme.colors.textMuted,
    fontFamily: theme.typography.family.body,
    fontSize: 11,
    lineHeight: 14,
  },
  errorBanner: {
    position: 'absolute',
    left: theme.spacing[4],
    right: theme.spacing[4],
    bottom: theme.spacing[4],
    borderRadius: theme.radius.card,
    borderWidth: 1,
    borderColor: theme.colors.alertBorder,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[3],
  },
  errorBannerText: {
    color: theme.colors.alertText,
    fontFamily: theme.typography.family.body,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: theme.typography.weight.medium,
  },
}));
