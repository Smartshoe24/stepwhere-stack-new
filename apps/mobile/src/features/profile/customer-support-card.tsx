import React from 'react';
import { Alert, Linking, Pressable, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { AppIcon } from '@/components/ui/app-icon';

const SUPPORT_PHONE = '4444444444';
const SUPPORT_EMAIL = 'support@stepwhere.app';

export function CustomerSupportCard() {
  function handleContactPress() {
    Alert.alert('Contact support', 'How would you like to reach us?', [
      {
        text: 'Call us',
        onPress: () => {
          void Linking.openURL(`tel:${SUPPORT_PHONE}`);
        },
      },
      {
        text: 'Mail us',
        onPress: () => {
          void Linking.openURL(`mailto:${SUPPORT_EMAIL}`);
        },
      },
      {
        text: 'Cancel',
        style: 'cancel',
      },
    ]);
  }

  return (
    <Pressable
      accessibilityRole="button"
      onPress={handleContactPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.iconPlate}>
        <AppIcon color={styles.icon.color} name="chat" size={20} />
      </View>
      <View style={styles.copy}>
        <Text style={styles.title}>Need help?</Text>
        <Text style={styles.subtitle}>Call or email StepWhere support.</Text>
      </View>
      <View style={styles.trailing}>
        <Text style={styles.trailingLabel}>Contact</Text>
        <AppIcon color={styles.chevron.color} name="chevron-right" size={18} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[3],
    borderRadius: theme.radius.card,
    borderWidth: 1,
    borderColor: theme.colors.chrome.cardBorder,
    backgroundColor: theme.colors.surface,
    padding: theme.spacing[4],
    ...theme.shadows.card,
  },
  iconPlate: {
    width: 40,
    height: 40,
    borderRadius: theme.radius.circle,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surfaceMuted,
  },
  icon: {
    color: theme.colors.primaryGreen,
  },
  copy: {
    flex: 1,
    gap: 2,
  },
  title: {
    color: theme.colors.text,
    fontFamily: theme.typography.family.display,
    ...theme.typography.text.bodyLarge,
    fontWeight: theme.typography.weight.medium,
  },
  subtitle: {
    color: theme.colors.textSecondary,
    fontFamily: theme.typography.family.body,
    ...theme.typography.text.meta,
  },
  trailing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[1],
  },
  trailingLabel: {
    color: theme.colors.textMuted,
    fontFamily: theme.typography.family.body,
    ...theme.typography.text.meta,
    fontWeight: theme.typography.weight.medium,
  },
  chevron: {
    color: theme.colors.textMuted,
  },
  pressed: {
    opacity: theme.colors.button.pressedOpacity,
  },
}));
