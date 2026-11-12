import React, { useEffect, useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StyleSheet } from 'react-native-unistyles';

import type { ShareDurationMinutes, ShareLinkDto } from '@stepwhere/types';

import { AppIcon } from '@/components/ui/app-icon';

export const SHARE_DURATION_OPTIONS: {
  durationMinutes: ShareDurationMinutes;
  label: string;
}[] = [
  { durationMinutes: 15, label: '15 minutes' },
  { durationMinutes: 60, label: '1 hour' },
  { durationMinutes: 240, label: '4 hours' },
];

export type ShareSheetMode = 'create' | 'manage' | 'replace';

type ShareDurationSheetProps = {
  activeShare?: ShareLinkDto | null;
  childName?: string;
  errorMessage?: string | null;
  isSubmitting?: boolean;
  mode: ShareSheetMode;
  onClose: () => void;
  onCreateNew: () => void;
  onDismiss?: () => void;
  onSelect: (durationMinutes: ShareDurationMinutes) => void;
  onShareCurrent: () => void;
  onStopSharing: () => void;
  visible: boolean;
};

export function formatShareDurationLabel(durationMinutes: ShareDurationMinutes) {
  return SHARE_DURATION_OPTIONS.find((option) => option.durationMinutes === durationMinutes)?.label ?? '1 hour';
}

function formatRemainingTime(expiresAt: string, nowMs: number) {
  const remainingMinutes = Math.max(
    0,
    Math.ceil((new Date(expiresAt).getTime() - nowMs) / 60_000),
  );

  if (remainingMinutes < 60) {
    return `${remainingMinutes} min remaining`;
  }

  const hours = Math.floor(remainingMinutes / 60);
  const minutes = remainingMinutes % 60;
  return minutes === 0
    ? `${hours} hr remaining`
    : `${hours} hr ${minutes} min remaining`;
}

export function ShareDurationSheet({
  activeShare = null,
  childName = 'your child',
  errorMessage = null,
  isSubmitting = false,
  mode,
  onClose,
  onCreateNew,
  onDismiss,
  onSelect,
  onShareCurrent,
  onStopSharing,
  visible,
}: ShareDurationSheetProps) {
  const insets = useSafeAreaInsets();
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!visible || mode !== 'manage') {
      return;
    }

    const timer = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, [mode, visible]);

  const isManageMode = mode === 'manage' && activeShare;
  const title = isManageMode
    ? 'Live location is being shared'
    : mode === 'replace'
      ? 'Create a new live link'
      : 'Share live location';
  const subtitle = isManageMode
    ? `Anyone with the current link can view ${childName.split(/\s+/)[0] ?? childName}'s location until it expires.`
    : mode === 'replace'
      ? 'Creating a new link will stop the current link immediately.'
      : 'Choose how long this link should remain active.';

  return (
    <Modal
      animationType="slide"
      onDismiss={onDismiss}
      onRequestClose={onClose}
      onShow={() => setNowMs(Date.now())}
      presentationStyle="overFullScreen"
      transparent
      visible={visible}>
      <SafeAreaView edges={['bottom']} style={styles.safeArea}>
        <Pressable
          accessibilityLabel="Close live sharing options"
          disabled={isSubmitting}
          onPress={onClose}
          style={styles.scrim}
        />
        <View style={styles.sheet(Math.max(insets.bottom, 12))}>
          <View style={styles.header}>
            <View style={styles.titleBlock}>
              <Text style={styles.title}>{title}</Text>
              <Text style={styles.subtitle}>{subtitle}</Text>
            </View>
            <Pressable
              accessibilityLabel="Close live sharing options"
              accessibilityRole="button"
              disabled={isSubmitting}
              hitSlop={4}
              onPress={onClose}
              style={({ pressed }) => [
                styles.closeButton,
                pressed && styles.pressed,
                isSubmitting && styles.disabled,
              ]}>
              <AppIcon color={styles.closeIcon.color} name="close" size={18} />
            </Pressable>
          </View>

          {isManageMode ? (
            <>
              <View style={styles.activeStatus}>
                <View style={styles.liveDot} />
                <View style={styles.activeStatusCopy}>
                  <Text style={styles.activeLabel}>CURRENT LINK</Text>
                  <Text style={styles.activeValue}>
                    {formatRemainingTime(activeShare.expiresAt, nowMs)}
                  </Text>
                </View>
              </View>
              <View style={styles.actionGroup}>
                <Pressable
                  accessibilityRole="button"
                  disabled={isSubmitting}
                  onPress={onShareCurrent}
                  style={({ pressed }) => [
                    styles.primaryButton,
                    pressed && styles.buttonPressed,
                    isSubmitting && styles.disabled,
                  ]}>
                  <AppIcon color={styles.primaryIcon.color} name="share" size={18} />
                  <Text style={styles.primaryLabel}>Share current link</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  disabled={isSubmitting}
                  onPress={onCreateNew}
                  style={({ pressed }) => [
                    styles.secondaryButton,
                    pressed && styles.buttonPressed,
                    isSubmitting && styles.disabled,
                  ]}>
                  <AppIcon color={styles.secondaryIcon.color} name="plus" size={18} />
                  <Text style={styles.secondaryLabel}>Create a new link</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  disabled={isSubmitting}
                  onPress={onStopSharing}
                  style={({ pressed }) => [
                    styles.stopButton,
                    pressed && styles.buttonPressed,
                    isSubmitting && styles.disabled,
                  ]}>
                  <AppIcon color={styles.stopIcon.color} name="shield-off" size={18} />
                  <Text style={styles.stopLabel}>Stop sharing</Text>
                </Pressable>
              </View>
            </>
          ) : (
            <View style={styles.optionGroup}>
              {SHARE_DURATION_OPTIONS.map((option) => (
                <Pressable
                  accessibilityRole="button"
                  disabled={isSubmitting}
                  key={option.durationMinutes}
                  onPress={() => onSelect(option.durationMinutes)}
                  style={({ pressed }) => [
                    styles.optionButton,
                    pressed && styles.buttonPressed,
                    isSubmitting && styles.disabled,
                  ]}>
                  <View style={styles.optionIconTile}>
                    <AppIcon color={styles.optionIcon.color} name="clock" size={18} />
                  </View>
                  <View style={styles.optionCopy}>
                    <Text style={styles.optionLabel}>
                      {mode === 'replace' ? `Replace with ${option.label}` : option.label}
                    </Text>
                    <Text style={styles.optionMeta}>Stops automatically</Text>
                  </View>
                  <AppIcon color={styles.chevronIcon.color} name="chevron-right" size={18} />
                </Pressable>
              ))}
            </View>
          )}

          {errorMessage ? (
            <View accessibilityLiveRegion="polite" style={styles.errorBanner}>
              <AppIcon color={styles.errorIcon.color} name="exclamation" size={16} />
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          ) : null}
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create(theme => ({
  safeArea: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: theme.colors.shadowStrong,
    opacity: 0.32,
  },
  sheet: (bottomInset: number) => ({
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    borderTopLeftRadius: theme.radius.sheet,
    borderTopRightRadius: theme.radius.sheet,
    borderWidth: 1,
    borderColor: theme.colors.chrome.cardBorder,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: theme.spacing[5],
    paddingTop: theme.spacing[5],
    paddingBottom: bottomInset + theme.spacing[4],
    gap: theme.spacing[4],
    ...theme.shadows.sheet,
  }),
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: theme.spacing[3],
  },
  titleBlock: {
    flex: 1,
    gap: theme.spacing[2],
  },
  title: {
    ...theme.typography.text.titleSmall,
    color: theme.colors.text,
    fontFamily: theme.typography.family.display,
    fontWeight: theme.typography.weight.bold,
  },
  subtitle: {
    ...theme.typography.text.body,
    color: theme.colors.textSecondary,
    fontFamily: theme.typography.family.body,
  },
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: theme.radius.circle,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surfaceMuted,
  },
  closeIcon: { color: theme.colors.icon },
  activeStatus: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[3],
    borderRadius: theme.radius.cardSmall,
    borderWidth: 1,
    borderColor: theme.colors.chrome.cardBorder,
    backgroundColor: theme.colors.surfaceMuted,
    paddingHorizontal: theme.spacing[4],
  },
  liveDot: {
    width: 10,
    height: 10,
    borderRadius: theme.radius.circle,
    backgroundColor: theme.colors.deepGreen,
  },
  activeStatusCopy: { gap: theme.spacing[1] },
  activeLabel: {
    ...theme.typography.text.overline,
    color: theme.colors.textMuted,
    fontFamily: theme.typography.family.body,
    fontWeight: theme.typography.weight.medium,
  },
  activeValue: {
    ...theme.typography.text.bodyLarge,
    ...theme.typography.tabular,
    color: theme.colors.text,
    fontFamily: theme.typography.family.display,
    fontWeight: theme.typography.weight.semibold,
  },
  actionGroup: { gap: theme.spacing[3] },
  primaryButton: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing[3],
    borderRadius: theme.radius.button,
    backgroundColor: theme.colors.primaryGreen,
    paddingHorizontal: theme.spacing[4],
  },
  primaryIcon: { color: theme.colors.badgeText },
  primaryLabel: {
    ...theme.typography.text.bodyLarge,
    color: theme.colors.badgeText,
    fontFamily: theme.typography.family.body,
    fontWeight: theme.typography.weight.semibold,
  },
  secondaryButton: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing[3],
    borderRadius: theme.radius.button,
    borderWidth: 1,
    borderColor: theme.colors.chrome.cardBorder,
    backgroundColor: theme.colors.surfaceMuted,
    paddingHorizontal: theme.spacing[4],
  },
  secondaryIcon: { color: theme.colors.icon },
  secondaryLabel: {
    ...theme.typography.text.bodyLarge,
    color: theme.colors.text,
    fontFamily: theme.typography.family.body,
    fontWeight: theme.typography.weight.semibold,
  },
  stopButton: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing[3],
    borderRadius: theme.radius.button,
    paddingHorizontal: theme.spacing[4],
  },
  stopIcon: { color: theme.colors.alertText },
  stopLabel: {
    ...theme.typography.text.body,
    color: theme.colors.alertText,
    fontFamily: theme.typography.family.body,
    fontWeight: theme.typography.weight.semibold,
  },
  optionGroup: { gap: theme.spacing[3] },
  optionButton: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[3],
    borderRadius: theme.radius.cardSmall,
    borderWidth: 1,
    borderColor: theme.colors.chrome.cardBorder,
    backgroundColor: theme.colors.surfaceMuted,
    paddingHorizontal: theme.spacing[3],
  },
  optionIconTile: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surface,
  },
  optionIcon: { color: theme.colors.primaryGreen },
  optionCopy: { flex: 1, gap: theme.spacing[1] },
  optionLabel: {
    ...theme.typography.text.bodyLarge,
    color: theme.colors.text,
    fontFamily: theme.typography.family.body,
    fontWeight: theme.typography.weight.semibold,
  },
  optionMeta: {
    ...theme.typography.text.caption,
    color: theme.colors.textMuted,
    fontFamily: theme.typography.family.body,
  },
  chevronIcon: { color: theme.colors.textMuted },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing[2],
    borderRadius: theme.radius.cardSmall,
    backgroundColor: theme.colors.alertBackground,
    padding: theme.spacing[3],
  },
  errorIcon: { color: theme.colors.alertText },
  errorText: {
    ...theme.typography.text.body,
    flex: 1,
    color: theme.colors.alertText,
    fontFamily: theme.typography.family.body,
  },
  buttonPressed: { transform: [{ scale: 0.98 }] },
  pressed: { opacity: theme.colors.button.pressedOpacity },
  disabled: { opacity: 0.45 },
}));
