import React from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { AppIcon, type AppIconName } from '@/components/ui/app-icon';

/**
 * Hosted alongside the Play Console listing entries. Play reviewers look for the
 * same policy to be reachable from inside the app, not just from the store page.
 */
const PRIVACY_POLICY_URL = 'https://www.stepwhere.in/policies/privacy-policy';
const TERMS_OF_SERVICE_URL = 'https://www.stepwhere.in/policies/terms-of-service';

type LegalLink = {
  icon: AppIconName;
  label: string;
  url: string;
};

const LEGAL_LINKS: LegalLink[] = [
  { icon: 'shield-check', label: 'Privacy policy', url: PRIVACY_POLICY_URL },
  { icon: 'logs', label: 'Terms of service', url: TERMS_OF_SERVICE_URL },
];

export function ProfileLegalCard() {
  return (
    <View style={styles.card}>
      {LEGAL_LINKS.map((link, index) => (
        <Pressable
          accessibilityHint="Opens in your browser"
          accessibilityLabel={link.label}
          accessibilityRole="link"
          key={link.url}
          onPress={() => {
            void Linking.openURL(link.url);
          }}
          style={({ pressed }) => [
            styles.row,
            index > 0 && styles.rowDivider,
            pressed && styles.pressed,
          ]}
        >
          <AppIcon color={styles.rowIcon.color} name={link.icon} size={18} />
          <Text style={styles.rowLabel}>{link.label}</Text>
          <AppIcon color={styles.rowChevron.color} name="chevron-right" size={18} />
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create(theme => ({
  card: {
    borderRadius: theme.radius.card,
    borderWidth: 1,
    borderColor: theme.colors.chrome.cardBorder,
    backgroundColor: theme.colors.surface,
    ...theme.shadows.card,
  },
  row: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[3],
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[3],
  },
  rowDivider: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.divider,
  },
  rowIcon: {
    color: theme.colors.icon,
  },
  rowLabel: {
    flex: 1,
    color: theme.colors.text,
    fontFamily: theme.typography.family.body,
    ...theme.typography.text.bodyLarge,
    fontWeight: theme.typography.weight.medium,
  },
  rowChevron: {
    color: theme.colors.textMuted,
  },
  pressed: {
    opacity: theme.colors.button.pressedOpacity,
  },
}));
