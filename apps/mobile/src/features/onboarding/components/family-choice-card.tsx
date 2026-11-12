import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { AppIcon } from '@/components/ui/app-icon';

type FamilyChoiceCardProps = {
  description: string;
  disabled?: boolean;
  icon: React.ComponentProps<typeof AppIcon>['name'];
  onPress: () => void;
  roleLabel: string;
  title: string;
};

export function FamilyChoiceCard({
  description,
  disabled = false,
  icon,
  onPress,
  roleLabel,
  title,
}: FamilyChoiceCardProps) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.card, disabled && styles.disabled, pressed && !disabled && styles.pressed]}>
      <View style={styles.iconWrap}>
        <AppIcon color={styles.icon.color} name={icon} size={22} />
      </View>
      <View style={styles.content}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.role}>{roleLabel}</Text>
        </View>
        {description ? <Text style={styles.description}>{description}</Text> : null}
      </View>
      <AppIcon color={styles.chevron.color} name="chevron-right" size={18} />
    </Pressable>
  );
}

const styles = StyleSheet.create(theme => ({
  card: {
    minHeight: 76,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.chrome.cardBorder,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[3],
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[3],
  },
  pressed: {
    opacity: 0.82,
  },
  disabled: {
    opacity: 0.56,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surfaceMuted,
    borderWidth: 1,
    borderColor: theme.colors.chrome.cardBorder,
  },
  icon: {
    color: theme.colors.primaryGreen,
  },
  content: {
    flex: 1,
    gap: 6,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing[2],
  },
  title: {
    flex: 1,
    color: theme.colors.text,
    fontFamily: theme.typography.family.display,
    fontSize: 15,
    lineHeight: 18,
    fontWeight: theme.typography.weight.medium,
  },
  role: {
    color: theme.colors.telemetry.positiveText,
    fontFamily: theme.typography.family.body,
    fontSize: 10,
    lineHeight: 12,
    fontWeight: theme.typography.weight.semibold,
    textTransform: 'uppercase',
  },
  description: {
    color: theme.colors.textSecondary,
    fontFamily: theme.typography.family.body,
    fontSize: 12,
    lineHeight: 16,
  },
  chevron: {
    color: theme.colors.textMuted,
  },
}));
