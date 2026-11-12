import React from 'react';
import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { AppIcon } from '@/components/ui/app-icon';

type QrPlaceholderFrameProps = {
  icon: React.ComponentProps<typeof AppIcon>['name'];
  subtitle: string;
  title: string;
};

export function QrPlaceholderFrame({
  icon,
  subtitle,
  title,
}: QrPlaceholderFrameProps) {
  return (
    <View style={styles.frame}>
      <View style={styles.scanBadge}>
        <AppIcon color={styles.scanIcon.color} name={icon} size={24} />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
    </View>
  );
}

const styles = StyleSheet.create(theme => ({
  frame: {
    minHeight: 196,
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: theme.colors.chrome.cardBorder,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing[5],
    gap: theme.spacing[2],
  },
  scanBadge: {
    width: 48,
    height: 48,
    borderRadius: theme.radius.circle,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surfaceMuted,
    borderWidth: 1,
    borderColor: theme.colors.chrome.cardBorder,
  },
  scanIcon: {
    color: theme.colors.textSecondary,
  },
  title: {
    color: theme.colors.text,
    fontFamily: theme.typography.family.display,
    fontSize: 15,
    lineHeight: 18,
    fontWeight: theme.typography.weight.medium,
    textAlign: 'center',
  },
  subtitle: {
    color: theme.colors.textSecondary,
    fontFamily: theme.typography.family.body,
    fontSize: 12,
    lineHeight: 16,
    textAlign: 'center',
  },
}));
