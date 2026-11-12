import { Image } from 'expo-image';
import React from 'react';
import { Modal, Platform, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StyleSheet } from 'react-native-unistyles';

import { AppIcon } from '@/components/ui/app-icon';

type ProfileAvatarLightboxProps = {
  avatarInitials: string;
  avatarUrl: string | null;
  displayName: string;
  onClose: () => void;
  onEditPhoto: () => void;
  visible: boolean;
};

export function ProfileAvatarLightbox({
  avatarInitials,
  avatarUrl,
  displayName,
  onClose,
  onEditPhoto,
  visible,
}: ProfileAvatarLightboxProps) {
  const [editAfterDismiss, setEditAfterDismiss] = React.useState(false);

  function handleEditPress() {
    // iOS cannot present a second modal while this one is still dismissing, so
    // the edit sheet is deferred to onDismiss. Android has no such restriction
    // and never fires onDismiss, so it is handed off on the next frame.
    setEditAfterDismiss(true);
    onClose();

    if (Platform.OS !== 'ios') {
      requestAnimationFrame(() => {
        setEditAfterDismiss(false);
        onEditPhoto();
      });
    }
  }

  return (
    <Modal
      animationType="fade"
      onDismiss={() => {
        if (editAfterDismiss) {
          setEditAfterDismiss(false);
          onEditPhoto();
        }
      }}
      onRequestClose={onClose}
      presentationStyle="overFullScreen"
      transparent
      visible={visible}
    >
      <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
        <Pressable
          accessibilityLabel="Close profile photo"
          accessibilityRole="button"
          onPress={onClose}
          style={styles.scrim}
        />
        <View style={styles.card}>
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={styles.title}>{displayName}</Text>
              <Text style={styles.subtitle}>Parent profile photo</Text>
            </View>
            <Pressable
              accessibilityLabel="Close profile photo"
              accessibilityRole="button"
              onPress={onClose}
              style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
            >
              <AppIcon color={styles.closeIcon.color} name="close" size={18} />
            </Pressable>
          </View>

          {avatarUrl ? (
            <Image contentFit="cover" source={{ uri: avatarUrl }} style={styles.image} />
          ) : (
            <View style={styles.fallback}>
              <Text style={styles.fallbackInitials}>{avatarInitials}</Text>
            </View>
          )}

          <Pressable
            accessibilityLabel="Edit profile photo"
            accessibilityRole="button"
            onPress={handleEditPress}
            style={({ pressed }) => [styles.editButton, pressed && styles.pressed]}
          >
            <AppIcon color={styles.editIcon.color} name="pencil" size={18} />
            <Text style={styles.editLabel}>Edit photo</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create(theme => ({
  safeArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing[5],
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: theme.colors.shadowStrong,
    opacity: 0.86,
  },
  card: {
    width: '100%',
    maxWidth: 440,
    gap: theme.spacing[4],
    borderRadius: theme.radius.card,
    borderWidth: 1,
    borderColor: theme.colors.chrome.cardBorder,
    backgroundColor: theme.colors.surface,
    padding: theme.spacing[5],
    ...theme.shadows.floating,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: theme.spacing[3],
  },
  headerCopy: {
    flex: 1,
    gap: 2,
  },
  title: {
    color: theme.colors.text,
    fontFamily: theme.typography.family.display,
    ...theme.typography.text.titleSmall,
    fontWeight: theme.typography.weight.bold,
  },
  subtitle: {
    color: theme.colors.textSecondary,
    fontFamily: theme.typography.family.body,
    ...theme.typography.text.body,
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
  image: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: theme.radius.card,
    backgroundColor: theme.colors.surfaceMuted,
  },
  fallback: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: theme.radius.card,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.avatar.parentGradientStart,
  },
  fallbackInitials: {
    color: theme.colors.avatar.onParentGradient,
    fontFamily: theme.typography.family.display,
    fontSize: 64,
    lineHeight: 72,
    fontWeight: theme.typography.weight.semibold,
  },
  // Neutral outlined action, matching the states recipe.
  editButton: {
    minHeight: 48,
    borderRadius: theme.radius.button,
    borderWidth: 1,
    borderColor: theme.colors.chrome.cardBorder,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing[2],
    backgroundColor: theme.colors.surface,
  },
  editIcon: {
    color: theme.colors.text,
  },
  editLabel: {
    color: theme.colors.text,
    fontFamily: theme.typography.family.body,
    ...theme.typography.text.body,
    fontWeight: theme.typography.weight.semibold,
  },
  pressed: {
    opacity: theme.colors.button.pressedOpacity,
  },
}));
