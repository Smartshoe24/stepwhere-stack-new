import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { AppIcon } from '@/components/ui/app-icon';

type FamilyPathCardProps = {
  accent: 'green' | 'blue';
  disabled?: boolean;
  icon: React.ComponentProps<typeof AppIcon>['name'];
  label: string;
  onPress: () => void;
  subtitle: string;
  title: string;
};

function getFamilyPathAccent(
  accent: 'green' | 'blue',
  isDark: boolean,
  theme: {
    colors: {
      primaryGreen: string;
      deepGreen: string;
      softGreen: string;
      geofence: {
        editing: string;
        editingHalo: string;
      };
    };
  },
) {
  if (accent === 'blue') {
    return {
      accentColor: theme.colors.geofence.editing,
      haloColor: theme.colors.geofence.editingHalo,
      borderColor: isDark ? 'rgba(96, 165, 250, 0.24)' : 'rgba(37, 99, 235, 0.18)',
    };
  }

  return {
    accentColor: isDark ? theme.colors.primaryGreen : theme.colors.deepGreen,
    haloColor: theme.colors.softGreen,
    borderColor: isDark ? 'rgba(34, 197, 94, 0.22)' : 'rgba(22, 163, 74, 0.16)',
  };
}

export function FamilyPathCard({
  accent,
  disabled = false,
  icon,
  label,
  onPress,
  subtitle,
  title,
}: FamilyPathCardProps) {
  const { rt, theme } = useUnistyles();
  const isDark = rt.themeName === 'dark';
  const accentStyles = getFamilyPathAccent(accent, isDark, theme);

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        isDark && styles.cardDark,
        styles.cardBorder(accentStyles.borderColor),
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
      ]}
    >
      <View style={styles.hero}>
        <View style={styles.halo(accentStyles.haloColor)}>
          <AppIcon color={accentStyles.accentColor} name={icon} size={34} />
        </View>
        <Text style={styles.label(accentStyles.accentColor)}>{label}</Text>
      </View>

      <View style={styles.copy}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>

      <View style={styles.footer}>
        <AppIcon color={styles.footerIcon.color} name="chevron-right" size={18} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  card: {
    flex: 1,
    minHeight: 176,
    borderRadius: theme.radius.cardSmall,
    borderWidth: 1,
    borderColor: theme.colors.chrome.cardBorder,
    backgroundColor: theme.colors.surface,
    padding: theme.spacing[4],
    justifyContent: 'space-between',
    ...theme.shadows.card,
  },
  cardDark: {
    backgroundColor: theme.colors.surfaceMuted,
  },
  cardBorder: (borderColor: string) => ({
    borderColor,
  }),
  hero: {
    gap: theme.spacing[3],
  },
  halo: (backgroundColor: string) => ({
    width: 72,
    height: 72,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor,
  }),
  label: (color: string) => ({
    alignSelf: 'flex-start',
    color,
    fontFamily: theme.typography.family.body,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: theme.typography.weight.semibold,
    textTransform: 'uppercase',
  }),
  copy: {
    gap: theme.spacing[2],
  },
  title: {
    color: theme.colors.text,
    fontFamily: theme.typography.family.display,
    fontSize: 20,
    lineHeight: 24,
    fontWeight: theme.typography.weight.semibold,
  },
  subtitle: {
    color: theme.colors.textSecondary,
    fontFamily: theme.typography.family.body,
    fontSize: 13,
    lineHeight: 18,
  },
  footer: {
    alignItems: 'flex-end',
  },
  footerIcon: {
    color: theme.colors.textMuted,
  },
  disabled: {
    opacity: 0.56,
  },
  pressed: {
    opacity: theme.colors.button.pressedOpacity,
  },
}));
