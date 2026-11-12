import { useRouter } from 'expo-router';
import React from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { StepwhereLogo } from '@/components/home/stepwhere-logo';
import { AnimatedThemeToggle } from '@/components/icons/animated/animated-theme-toggle';
import { getRuntimeThemeName } from '@/components/theme/switch-runtime-theme';
import { useThemeTransition } from '@/components/theme/use-theme-transition';
import { AppIcon } from '@/components/ui/app-icon';

type AuthScreenShellProps = {
  backHref?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  subtitle: string;
  title: string;
};

export function AuthScreenShell({
  backHref,
  children,
  footer,
  subtitle,
  title,
}: AuthScreenShellProps) {
  const router = useRouter();
  const { rt } = useUnistyles();
  const { isTransitioning, runThemeTransition, transitionTargetTheme } = useThemeTransition();
  const themeName = rt.themeName === 'dark' ? 'dark' : 'light';
  const effectiveThemeName = isTransitioning ? transitionTargetTheme ?? themeName : themeName;

  async function handleThemeToggle(origin: { x: number; y: number }) {
    await runThemeTransition({
      origin,
      targetTheme: getRuntimeThemeName() === 'dark' ? 'light' : 'dark',
    });
  }

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboard}>
        <ScrollView
          bounces={false}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <View style={styles.headerRow}>
            {backHref ? (
              <Pressable
                accessibilityLabel="Go back"
                accessibilityRole="button"
                onPress={() => router.back()}
                style={({ pressed }) => [styles.backButton, pressed && styles.backPressed]}>
                <AppIcon color={styles.backIcon.color} name="arrow-left" size={20} />
              </Pressable>
            ) : (
              <View style={styles.sideSpacer} />
            )}
            <AnimatedThemeToggle
              animateIcon={!isTransitioning}
              disabled={isTransitioning}
              onPress={handleThemeToggle}
              themeName={effectiveThemeName}
            />
          </View>

          <View style={styles.hero}>
            <View style={styles.logoWrap}>
              <StepwhereLogo height={22} />
            </View>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.subtitle}>{subtitle}</Text>
          </View>

          <View style={styles.card}>{children}</View>
          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create(theme => ({
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  keyboard: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: theme.spacing[4],
    paddingTop: theme.spacing[2],
    paddingBottom: theme.spacing[6],
  },
  headerRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sideSpacer: {
    width: 44,
    height: 44,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: theme.radius.circle,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.button.surface,
    borderWidth: 1,
    borderColor: theme.colors.button.border,
    ...theme.shadows.card,
  },
  backPressed: {
    opacity: theme.colors.button.pressedOpacity,
  },
  backIcon: {
    color: theme.colors.button.icon,
  },
  hero: {
    paddingTop: theme.spacing[7],
    paddingBottom: theme.spacing[5],
    gap: theme.spacing[3],
  },
  logoWrap: {
    alignSelf: 'flex-start',
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.chrome.cardBorder,
  },
  title: {
    color: theme.colors.text,
    fontFamily: theme.typography.family.display,
    fontSize: 30,
    lineHeight: 34,
    fontWeight: theme.typography.weight.semibold,
  },
  subtitle: {
    color: theme.colors.textSecondary,
    fontFamily: theme.typography.family.body,
    fontSize: 15,
    lineHeight: 22,
  },
  card: {
    gap: theme.spacing[4],
    padding: theme.spacing[5],
    borderRadius: theme.radius.card,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.chrome.cardBorder,
    ...theme.shadows.card,
  },
  footer: {
    marginTop: theme.spacing[4],
    alignItems: 'center',
  },
}));
