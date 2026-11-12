import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import type { ThemeToggleOrigin } from '@/components/icons/animated/animated-theme-toggle';
import { AppTopBar } from '@/components/layout/app-top-bar';
import { useThemeTransition } from '@/components/theme/use-theme-transition';

type ScreenShellProps = {
  children?: React.ReactNode;
  onBellPress?: () => void;
  onThemeTogglePress: (origin: ThemeToggleOrigin) => void;
  subtitle?: string;
  title: string;
};

export function ScreenShell({
  children,
  onBellPress,
  onThemeTogglePress,
  subtitle,
  title,
}: ScreenShellProps) {
  const { rt } = useUnistyles();
  const { isTransitioning } = useThemeTransition();
  const themeName = rt.themeName === 'dark' ? 'dark' : 'light';

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <StatusBar style={rt.themeName === 'dark' ? 'light' : 'dark'} />
      <View style={styles.container}>
        <View style={styles.topBarBand}>
          <AppTopBar
            animateThemeIcon={!isTransitioning}
            onThemeTogglePress={onThemeTogglePress}
            secondaryAction={{
              kind: 'bell',
              badgeLabel: '2',
              onPress: onBellPress,
            }}
            themeName={themeName}
            themeToggleDisabled={isTransitioning}
          />
        </View>
        <View style={styles.top}>
          <View style={styles.card}>
            <Text style={styles.title}>{title}</Text>
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
            {children}
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create(theme => ({
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  topBarBand: {
    paddingTop: 6,
    backgroundColor: theme.colors.chrome.topBarSurface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.chrome.topBarBorder,
  },
  top: {
    flex: 1,
  },
  card: {
    marginTop: theme.spacing[4],
    marginHorizontal: theme.spacing[4],
    padding: theme.spacing[6],
    borderRadius: theme.radius.card,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.chrome.cardBorder,
    ...theme.shadows.card,
  },
  title: {
    color: theme.colors.text,
    fontFamily: theme.typography.family.display,
    fontSize: theme.typography.size.title,
    fontWeight: theme.typography.weight.semibold,
  },
  subtitle: {
    marginTop: theme.spacing[2],
    color: theme.colors.textSecondary,
    fontFamily: theme.typography.family.body,
    fontSize: theme.typography.size.body,
    lineHeight: 20,
  },
}));
