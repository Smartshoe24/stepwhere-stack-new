import { useRouter } from 'expo-router';
import React from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StyleSheet } from 'react-native-unistyles';

import { AppIcon } from '@/components/ui/app-icon';
import { useAuth } from '@/features/auth/use-auth';
import { OnboardingScrollContext } from './onboarding-scroll-context';

type MinimalOnboardingScreenProps = {
  backHref?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  progressCurrent: number;
  progressTotal: number;
  subtitle?: string;
  title: string;
};

export function MinimalOnboardingScreen({
  backHref,
  children,
  footer,
  progressCurrent,
  progressTotal,
  subtitle,
  title,
}: MinimalOnboardingScreenProps) {
  const auth = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [isSigningOut, setIsSigningOut] = React.useState(false);
  const scrollRef = React.useRef<ScrollView>(null);
  const scrollContext = React.useMemo(() => ({
    revealFocusedField: () => {
      setTimeout(() => {
        scrollRef.current?.scrollToEnd({ animated: true });
      }, 180);
    },
  }), []);

  async function handleSignOut() {
    if (isSigningOut) {
      return;
    }

    setIsSigningOut(true);

    try {
      await auth.signOut();
    } catch (error) {
      if (__DEV__) {
        console.warn('Onboarding sign out failed', error);
      }
    } finally {
      setIsSigningOut(false);
    }
  }

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboard}>
        <View style={styles.screen}>
          <View style={styles.header}>
            {backHref ? (
              <Pressable
                accessibilityLabel="Go back"
                accessibilityRole="button"
                onPress={() => router.replace(backHref as never)}
                style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
                <AppIcon color={styles.backIcon.color} name="arrow-left" size={18} />
              </Pressable>
            ) : (
              <View style={styles.backSpacer} />
            )}
            <View style={styles.progressWrap}>
              <Text style={styles.progress}>{`${progressCurrent} of ${progressTotal}`}</Text>
            </View>
            <Pressable
              accessibilityLabel="Log out"
              accessibilityRole="button"
              disabled={isSigningOut}
              onPress={() => {
                void handleSignOut();
              }}
              style={({ pressed }) => [
                styles.logoutButton,
                isSigningOut && styles.disabled,
                pressed && styles.pressed,
              ]}>
              <AppIcon color={styles.logoutIcon.color} name="logout" size={18} />
            </Pressable>
          </View>

          <ScrollView
            automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
            bounces={false}
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            ref={scrollRef}
            showsVerticalScrollIndicator={false}>
            <View style={styles.copyBlock}>
              <Text style={styles.title}>{title}</Text>
              {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
            </View>
            <OnboardingScrollContext.Provider value={scrollContext}>
              <View style={styles.stack}>{children}</View>
            </OnboardingScrollContext.Provider>
          </ScrollView>

          {footer ? <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>{footer}</View> : null}
        </View>
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
  screen: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    minHeight: 56,
    paddingHorizontal: theme.spacing[4],
    paddingTop: theme.spacing[2],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: theme.radius.circle,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.button.surface,
    borderWidth: 1,
    borderColor: theme.colors.button.border,
  },
  backSpacer: {
    width: 40,
    height: 40,
  },
  progressWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: theme.colors.button.pressedOpacity,
  },
  disabled: {
    opacity: 0.5,
  },
  backIcon: {
    color: theme.colors.button.icon,
  },
  logoutButton: {
    width: 40,
    height: 40,
    borderRadius: theme.radius.circle,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.button.surface,
    borderWidth: 1,
    borderColor: theme.colors.button.border,
  },
  logoutIcon: {
    color: theme.colors.button.icon,
  },
  progress: {
    color: theme.colors.textMuted,
    fontFamily: theme.typography.family.body,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: theme.typography.weight.medium,
  },
  content: {
    paddingHorizontal: theme.spacing[4],
    paddingTop: theme.spacing[5],
    paddingBottom: theme.spacing[6],
    gap: theme.spacing[5],
  },
  copyBlock: {
    gap: theme.spacing[2],
  },
  title: {
    color: theme.colors.text,
    fontFamily: theme.typography.family.display,
    fontSize: 24,
    lineHeight: 28,
    fontWeight: theme.typography.weight.semibold,
  },
  subtitle: {
    color: theme.colors.textSecondary,
    fontFamily: theme.typography.family.body,
    fontSize: 14,
    lineHeight: 20,
  },
  stack: {
    gap: theme.spacing[4],
  },
  footer: {
    paddingHorizontal: theme.spacing[4],
    paddingTop: theme.spacing[3],
    backgroundColor: theme.colors.background,
  },
}));
