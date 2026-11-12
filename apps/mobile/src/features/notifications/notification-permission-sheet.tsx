import React from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon } from '@/components/ui/app-icon';

type NotificationPermissionSheetProps = {
  onClose: () => void;
  onEnable: () => void;
  visible: boolean;
};

export function NotificationPermissionSheet({
  onClose,
  onEnable,
  visible,
}: NotificationPermissionSheetProps) {
  const insets = useSafeAreaInsets();
  const { theme } = useUnistyles();

  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      transparent
      visible={visible}>
      <Pressable onPress={onClose} style={styles.backdrop} />
      <View style={styles.sheetWrap(insets.bottom)}>
        <View style={styles.sheet}>
          <View style={styles.iconWrap}>
            <AppIcon color={theme.colors.primaryGreen} name="bell" size={20} />
          </View>
          <Text style={styles.title}>Stay notified</Text>
          <Text style={styles.body}>
            Get child safety alerts when a geofence is breached and other important updates.
          </Text>
          <View style={styles.actions}>
            <Pressable onPress={onClose} style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}>
              <Text style={styles.secondaryLabel}>Not now</Text>
            </Pressable>
            <Pressable onPress={onEnable} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
              <Text style={styles.primaryLabel}>Enable</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create((theme) => ({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.36)',
  },
  sheetWrap: (bottomInset: number) => ({
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: theme.spacing[4],
    paddingBottom: Math.max(bottomInset, theme.spacing[4]),
  }),
  sheet: {
    borderTopLeftRadius: theme.radius.card,
    borderTopRightRadius: theme.radius.card,
    borderRadius: theme.radius.card,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.chrome.cardBorder,
    paddingHorizontal: theme.spacing[5],
    paddingTop: theme.spacing[5],
    paddingBottom: theme.spacing[5],
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: theme.radius.circle,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.softGreen,
    marginBottom: theme.spacing[3],
  },
  title: {
    color: theme.colors.text,
    fontFamily: theme.typography.family.display,
    fontSize: 18,
    lineHeight: 22,
    fontWeight: theme.typography.weight.semibold,
  },
  body: {
    marginTop: theme.spacing[2],
    color: theme.colors.textSecondary,
    fontFamily: theme.typography.family.body,
    fontSize: 13,
    lineHeight: 18,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: theme.spacing[3],
    marginTop: theme.spacing[5],
  },
  secondaryButton: {
    minHeight: 40,
    borderRadius: theme.radius.button,
    paddingHorizontal: theme.spacing[4],
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.colors.chrome.cardBorder,
    backgroundColor: theme.colors.surface,
  },
  secondaryLabel: {
    color: theme.colors.text,
    fontFamily: theme.typography.family.body,
    fontSize: 13,
    lineHeight: 16,
    fontWeight: theme.typography.weight.medium,
  },
  primaryButton: {
    minHeight: 40,
    borderRadius: theme.radius.button,
    paddingHorizontal: theme.spacing[4],
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.primaryGreen,
  },
  primaryLabel: {
    color: '#FFFFFF',
    fontFamily: theme.typography.family.body,
    fontSize: 13,
    lineHeight: 16,
    fontWeight: theme.typography.weight.semibold,
  },
  pressed: {
    opacity: 0.82,
  },
}));
