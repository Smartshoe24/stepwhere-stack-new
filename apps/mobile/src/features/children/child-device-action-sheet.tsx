import * as Clipboard from 'expo-clipboard';
import React from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StyleSheet } from 'react-native-unistyles';

import { AppIcon } from '@/components/ui/app-icon';

type ChildDeviceActionSheetProps = {
  childName: string;
  deviceHardwareIdentifier: string | null;
  isPending: boolean;
  onClose: () => void;
  onConfirm: (input: { deleteChild: boolean }) => void;
  visible: boolean;
};

function ChildDeviceActionSheetBody({
  childName,
  deviceHardwareIdentifier,
  isPending,
  onClose,
  onConfirm,
}: Omit<ChildDeviceActionSheetProps, 'visible'>) {
  const insets = useSafeAreaInsets();
  const [deleteChild, setDeleteChild] = React.useState(false);
  const [copyMessage, setCopyMessage] = React.useState<string | null>(null);

  async function handleCopy() {
    if (!deviceHardwareIdentifier) {
      return;
    }

    await Clipboard.setStringAsync(deviceHardwareIdentifier);
    setCopyMessage('Shoe ID copied.');
    setTimeout(() => {
      setCopyMessage(null);
    }, 2000);
  }

  return (
    <SafeAreaView edges={['bottom']} style={styles.safeArea}>
      <Pressable onPress={onClose} style={styles.scrim} />
      <View style={styles.sheet(Math.max(insets.bottom, 12))}>
        <View style={styles.header}>
          <Text style={styles.title}>Unlink shoe?</Text>
          <Pressable onPress={onClose} style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}>
            <AppIcon color={styles.closeIcon.color} name="close" size={18} />
          </Pressable>
        </View>
        <Text style={styles.body}>This stops live tracking for {childName} until another shoe is connected.</Text>

        {deviceHardwareIdentifier ? (
          <View style={styles.deviceCard}>
            <View style={styles.deviceCopy}>
              <Text style={styles.deviceLabel}>Shoe ID</Text>
              <Text style={styles.deviceValue}>{deviceHardwareIdentifier}</Text>
            </View>
            <Pressable onPress={() => { void handleCopy(); }} style={({ pressed }) => [styles.copyButton, pressed && styles.pressed]}>
              <AppIcon color={styles.copyIcon.color} name="copy" size={16} />
              <Text style={styles.copyLabel}>Copy</Text>
            </Pressable>
          </View>
        ) : null}

        <Pressable onPress={() => setDeleteChild((current) => !current)} style={({ pressed }) => [styles.checkboxRow, pressed && styles.pressed]}>
          <View style={styles.checkbox(deleteChild)}>
            {deleteChild ? <AppIcon color="#FFFFFF" name="check" size={14} /> : null}
          </View>
          <Text style={styles.checkboxLabel}>Also remove child profile</Text>
        </Pressable>

        {copyMessage ? <Text style={styles.successText}>{copyMessage}</Text> : null}

        <View style={styles.footer}>
          <Pressable disabled={isPending} onPress={onClose} style={({ pressed }) => [styles.secondaryButton, isPending && styles.disabled, pressed && !isPending && styles.pressed]}>
            <Text style={styles.secondaryLabel}>Cancel</Text>
          </Pressable>
          <Pressable
            disabled={isPending}
            onPress={() => onConfirm({ deleteChild })}
            style={({ pressed }) => [styles.primaryButton, isPending && styles.disabled, pressed && !isPending && styles.pressed]}
          >
            <Text style={styles.primaryLabel}>{isPending ? 'Working...' : deleteChild ? 'Remove child' : 'Unlink shoe'}</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

export function ChildDeviceActionSheet(props: ChildDeviceActionSheetProps) {
  return (
    <Modal animationType="slide" onRequestClose={props.onClose} presentationStyle="overFullScreen" transparent visible={props.visible}>
      {props.visible ? <ChildDeviceActionSheetBody {...props} /> : null}
    </Modal>
  );
}

const styles = StyleSheet.create((theme) => ({
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
    borderTopLeftRadius: theme.radius.card,
    borderTopRightRadius: theme.radius.card,
    borderWidth: 1,
    borderColor: theme.colors.chrome.cardBorder,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: theme.spacing[5],
    paddingTop: theme.spacing[5],
    paddingBottom: bottomInset + theme.spacing[4],
    gap: theme.spacing[4],
    ...theme.shadows.floating,
  }),
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    color: theme.colors.text,
    fontFamily: theme.typography.family.display,
    fontSize: 20,
    lineHeight: 24,
    fontWeight: theme.typography.weight.bold,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: theme.radius.circle,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surfaceMuted,
  },
  closeIcon: {
    color: theme.colors.icon,
  },
  body: {
    color: theme.colors.textSecondary,
    fontFamily: theme.typography.family.body,
    fontSize: 13,
    lineHeight: 18,
  },
  deviceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing[3],
    borderRadius: theme.radius.button,
    borderWidth: 1,
    borderColor: theme.colors.chrome.cardBorder,
    backgroundColor: theme.colors.surfaceMuted,
    padding: theme.spacing[4],
  },
  deviceCopy: {
    flex: 1,
    gap: 2,
  },
  deviceLabel: {
    color: theme.colors.textSecondary,
    fontFamily: theme.typography.family.body,
    fontSize: 12,
    lineHeight: 16,
  },
  deviceValue: {
    color: theme.colors.text,
    fontFamily: theme.typography.family.display,
    fontSize: 15,
    lineHeight: 18,
    fontWeight: theme.typography.weight.medium,
  },
  copyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[2],
  },
  copyIcon: {
    color: theme.colors.textMuted,
  },
  copyLabel: {
    color: theme.colors.textMuted,
    fontFamily: theme.typography.family.body,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: theme.typography.weight.semibold,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[3],
  },
  checkbox: (selected: boolean) => ({
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: selected ? theme.colors.alertBorder : theme.colors.chrome.cardBorder,
    backgroundColor: selected ? theme.colors.alertBorder : theme.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  }),
  checkboxLabel: {
    color: theme.colors.text,
    fontFamily: theme.typography.family.body,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: theme.typography.weight.medium,
  },
  successText: {
    color: theme.colors.primaryGreen,
    fontFamily: theme.typography.family.body,
    fontSize: 12,
    lineHeight: 16,
  },
  footer: {
    flexDirection: 'row',
    gap: theme.spacing[3],
  },
  secondaryButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: theme.radius.button,
    borderWidth: 1,
    borderColor: theme.colors.chrome.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surface,
  },
  secondaryLabel: {
    color: theme.colors.text,
    fontFamily: theme.typography.family.display,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: theme.typography.weight.semibold,
  },
  primaryButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: theme.radius.button,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.alertBorder,
  },
  primaryLabel: {
    color: '#FFFFFF',
    fontFamily: theme.typography.family.display,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: theme.typography.weight.semibold,
  },
  disabled: {
    opacity: 0.6,
  },
  pressed: {
    opacity: theme.colors.button.pressedOpacity,
  },
}));
