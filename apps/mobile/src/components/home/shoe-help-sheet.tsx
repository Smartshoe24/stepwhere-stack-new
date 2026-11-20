import React from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StyleSheet } from 'react-native-unistyles';

import { AppIcon } from '@/components/ui/app-icon';
import { FIRST_CONNECTION_EXPECTED_MINUTES } from '@/features/overview/shoe-connection';
import { showSupportOptions } from '@/features/profile/customer-support-card';

type ShoeHelpSheetProps = {
  onClose: () => void;
  visible: boolean;
};

const STEPS = [
  'Charge the shoe fully.',
  'Take it outside or near a window so it can find a signal.',
  `Wait up to ${FIRST_CONNECTION_EXPECTED_MINUTES} minutes. The first connection can take that long.`,
];

function ShoeHelpSheetBody({ onClose }: Omit<ShoeHelpSheetProps, 'visible'>) {
  const insets = useSafeAreaInsets();

  return (
    <SafeAreaView edges={['bottom']} style={styles.safeArea}>
      <Pressable onPress={onClose} style={styles.scrim} />
      <View style={styles.sheet(Math.max(insets.bottom, 12))}>
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text style={styles.title}>Shoe not connecting?</Text>
            <Text style={styles.subtitle}>
              Most often the battery is empty. Try these steps in order.
            </Text>
          </View>
          <Pressable
            accessibilityLabel="Close"
            onPress={onClose}
            style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}>
            <AppIcon color={styles.closeIcon.color} name="close" size={18} />
          </Pressable>
        </View>

        <View style={styles.steps}>
          {STEPS.map((step, index) => (
            <View key={step} style={styles.stepRow}>
              <View style={styles.stepNumber}>
                <Text style={styles.stepNumberText}>{index + 1}</Text>
              </View>
              <Text style={styles.stepText}>{step}</Text>
            </View>
          ))}
        </View>

        <View style={styles.footer}>
          <Pressable
            onPress={onClose}
            style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}>
            <Text style={styles.secondaryButtonLabel}>Close</Text>
          </Pressable>
          <Pressable
            onPress={showSupportOptions}
            style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
            <Text style={styles.primaryButtonLabel}>Contact support</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

export function ShoeHelpSheet(props: ShoeHelpSheetProps) {
  return (
    <Modal
      animationType="slide"
      onRequestClose={props.onClose}
      presentationStyle="overFullScreen"
      transparent
      visible={props.visible}>
      {props.visible ? <ShoeHelpSheetBody onClose={props.onClose} /> : null}
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
    justifyContent: 'space-between',
    gap: theme.spacing[3],
  },
  headerCopy: {
    flex: 1,
    gap: theme.spacing[1],
  },
  title: {
    color: theme.colors.text,
    fontFamily: theme.typography.family.display,
    fontSize: 20,
    lineHeight: 24,
    fontWeight: theme.typography.weight.bold,
  },
  subtitle: {
    color: theme.colors.textSecondary,
    fontFamily: theme.typography.family.body,
    fontSize: 13,
    lineHeight: 18,
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
  steps: {
    gap: theme.spacing[3],
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing[3],
  },
  stepNumber: {
    width: 26,
    height: 26,
    borderRadius: theme.radius.circle,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surfaceMuted,
    borderWidth: 1,
    borderColor: theme.colors.chrome.cardBorder,
  },
  stepNumberText: {
    color: theme.colors.text,
    fontFamily: theme.typography.family.body,
    fontSize: 13,
    lineHeight: 16,
    fontWeight: theme.typography.weight.semibold,
  },
  stepText: {
    flex: 1,
    paddingTop: 3,
    color: theme.colors.text,
    fontFamily: theme.typography.family.body,
    fontSize: 14,
    lineHeight: 20,
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
  secondaryButtonLabel: {
    color: theme.colors.text,
    fontFamily: theme.typography.family.body,
    fontSize: 14,
    fontWeight: theme.typography.weight.semibold,
  },
  primaryButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: theme.radius.button,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.primaryGreen,
  },
  primaryButtonLabel: {
    color: theme.colors.badgeText,
    fontFamily: theme.typography.family.body,
    fontSize: 14,
    fontWeight: theme.typography.weight.semibold,
  },
  pressed: {
    opacity: theme.colors.button.pressedOpacity,
  },
}));
