import { BlurTargetView } from 'expo-blur';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { Alert, type LayoutChangeEvent, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { AppTabChrome } from '@/components/layout/app-child-top-chrome';
import { AppBootstrapScreen } from '@/components/loading/app-bootstrap-screen';
import { useNativeTabVisibility } from '@/components/navigation/native-tab-visibility';
import { getRuntimeThemeName } from '@/components/theme/switch-runtime-theme';
import { useThemeTransition } from '@/components/theme/use-theme-transition';
import { useAuth } from '@/features/auth/use-auth';
import { toOverviewChildCard } from '@/features/overview/overview-ui';
import { ApiError } from '@/lib/api-client';
import { useFamilyMembersQuery, useLeaveFamilyMutation, useOverviewQuery } from '@/query/hooks';

import { CustomerSupportCard } from './customer-support-card';
import { FamilyInviteQrSheet } from './family-invite-qr-sheet';
import { ParentProfileEditSheet } from './parent-profile-edit-sheet';
import { ProfileAccountActions } from './profile-account-actions';
import { ProfileAvatarLightbox } from './profile-avatar-lightbox';
import { ProfileChildrenCard } from './profile-children-card';
import {
  formatFamilyCount,
  formatMonthYear,
  getInitials,
} from './profile-formatters';
import { ProfileIdentityCard } from './profile-identity-card';
import { ProfileLegalCard } from './profile-legal-card';
import { ProfileErrorState, ProfileNoticeBanner } from './profile-states';
import { SwitchFamilyCard } from './switch-family-card';

const NOTICE_TIMEOUT_MS = 2500;

export function ProfileScreen() {
  const auth = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { rt, theme } = useUnistyles();
  const { isTransitioning, runThemeTransition, transitionTargetTheme } = useThemeTransition();
  const { setHidden } = useNativeTabVisibility();
  const [topBarHeight, setTopBarHeight] = React.useState(insets.top + 68);
  const [isSigningOut, setIsSigningOut] = React.useState(false);
  const [isProfileEditVisible, setIsProfileEditVisible] = React.useState(false);
  const [isAvatarPreviewVisible, setIsAvatarPreviewVisible] = React.useState(false);
  const [isInviteSheetVisible, setIsInviteSheetVisible] = React.useState(false);
  const [notice, setNotice] = React.useState<string | null>(null);

  const user = auth.user;
  const displayName = user?.displayName?.trim() || 'Parent';
  const phoneNumber = user?.phoneNumber || 'Unavailable';
  const email = user?.email || 'Email not provided';
  const avatarUrl = user?.avatarUrl || null;
  const memberRole = user?.family.memberRole ?? null;
  const familyOrganizationId = user?.family.organization?.id ?? null;
  const familyMembersQuery = useFamilyMembersQuery(familyOrganizationId);
  const overviewQuery = useOverviewQuery(familyOrganizationId);
  const leaveFamilyMutation = useLeaveFamilyMutation();
  const overviewChildren = React.useMemo(
    () => (overviewQuery.data?.children ?? []).map(child => toOverviewChildCard(child)),
    [overviewQuery.data?.children],
  );
  const familyMemberCount = familyMembersQuery.data?.length ?? null;
  const protectingSince = formatMonthYear(
    user?.family.organization?.createdAt ?? user?.createdAt,
  );
  const familyMeta = formatFamilyCount(familyMemberCount, memberRole);
  const isVerified = user?.status !== 'suspended';
  const avatarInitials = getInitials(displayName);
  const canManageChildren = Boolean(user?.family.permissions.canManageChildren);
  const canManageJoinCodes = Boolean(user?.family.permissions.canManageJoinCodes);
  const themeName = rt.themeName === 'dark' ? 'dark' : 'light';
  const statusBarThemeName = isTransitioning ? transitionTargetTheme ?? themeName : themeName;
  const familyName = user?.family.organization?.familyName
    ?? user?.family.organization?.name
    ?? 'Family';
  const queryError = overviewQuery.error ?? familyMembersQuery.error;
  const errorMessage = queryError instanceof Error
    ? queryError.message
    : queryError
      ? 'Profile could not be loaded.'
      : null;

  React.useEffect(() => {
    setHidden(false);
  }, [setHidden]);

  React.useEffect(() => {
    if (!notice) {
      return;
    }

    const timeout = setTimeout(() => setNotice(null), NOTICE_TIMEOUT_MS);

    return () => clearTimeout(timeout);
  }, [notice]);

  function buildEmptyFamilyContext() {
    return {
      organization: null,
      memberRole: null,
      permissions: {
        canManageChildren: false,
        canManageGeofences: false,
        canManageMembers: false,
        canManageJoinCodes: false,
        canCreateShareLinks: false,
      },
      requiresOnboarding: true,
    };
  }

  async function handleSignOut() {
    if (isSigningOut) {
      return;
    }

    setIsSigningOut(true);

    try {
      await auth.signOut();
    } catch {
      setNotice('Failed to log out. Try again.');
    } finally {
      setIsSigningOut(false);
    }
  }

  function handleAddChildPress() {
    if (!canManageChildren) {
      return;
    }

    router.push('/add-child/connect-device?returnTo=profile' as never);
  }

  function handleChildPress(childId: string) {
    if (!canManageChildren) {
      return;
    }

    router.push(`/children/${childId}/edit` as never);
  }

  async function handleThemeToggle(origin: { x: number; y: number }) {
    await runThemeTransition({
      origin,
      targetTheme: getRuntimeThemeName() === 'dark' ? 'light' : 'dark',
    });
  }

  function handleMembersPress() {
    if (!familyOrganizationId) {
      return;
    }

    router.push('/family/members');
  }

  function confirmLeaveFamily() {
    if (!user?.family.organization) {
      return;
    }

    if (memberRole === 'admin' && overviewChildren.length > 0) {
      setNotice('Remove children before leaving this family.');
      return;
    }

    Alert.alert('Leave family?', 'You will need an invite to join a family again.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave family',
        style: 'destructive',
        onPress: () => {
          void handleLeaveFamily();
        },
      },
    ]);
  }

  async function handleLeaveFamily() {
    try {
      await leaveFamilyMutation.mutateAsync();
      auth.applyProfilePatch({
        onboardingCompleted: false,
        family: buildEmptyFamilyContext(),
      });
      await auth.refreshSession();
      router.replace('/onboarding/family');
    } catch (error) {
      if (error instanceof ApiError && error.code === 'FAMILY_HAS_MEMBERS') {
        setNotice('Remove family members before leaving this family.');
        return;
      }

      if (error instanceof ApiError && error.code === 'FAMILY_HAS_CHILDREN') {
        setNotice('Remove children before leaving this family.');
        return;
      }

      setNotice('Could not leave family. Try again.');
    }
  }

  function handleRefresh() {
    void Promise.all([overviewQuery.refetch(), familyMembersQuery.refetch()]);
  }

  function handleTopBarLayout(event: LayoutChangeEvent) {
    setTopBarHeight(Math.round(event.nativeEvent.layout.height));
  }

  if (auth.status === 'loading') {
    return <AppBootstrapScreen />;
  }

  return (
    <SafeAreaView edges={[]} style={styles.safeArea}>
      <StatusBar style={statusBarThemeName === 'dark' ? 'light' : 'dark'} />
      <View style={styles.container}>
        <BlurTargetView style={styles.blurTarget}>
          <View style={styles.topChromeSpacer(topBarHeight)} />

          <ScrollView
            contentContainerStyle={styles.content(insets.bottom)}
            refreshControl={
              <RefreshControl
                onRefresh={handleRefresh}
                refreshing={overviewQuery.isRefetching || familyMembersQuery.isRefetching}
                tintColor={theme.colors.navActive}
              />
            }
            showsVerticalScrollIndicator={false}
            style={styles.scroll}
          >
            <View style={styles.header}>
              <Text style={styles.headerTitle}>Profile</Text>
            </View>

            {notice ? (
              <View style={styles.noticeWrap}>
                <ProfileNoticeBanner message={notice} />
              </View>
            ) : null}

            <ProfileIdentityCard
              avatarInitials={avatarInitials}
              avatarUrl={avatarUrl}
              canManageJoinCodes={canManageJoinCodes}
              displayName={displayName}
              email={email}
              familyMeta={familyMeta}
              isVerified={isVerified}
              onAvatarPress={() => {
                if (avatarUrl) {
                  setIsAvatarPreviewVisible(true);
                } else {
                  setIsProfileEditVisible(true);
                }
              }}
              onEditPress={() => setIsProfileEditVisible(true)}
              onInvitePress={() => setIsInviteSheetVisible(true)}
              onMembersPress={handleMembersPress}
              phoneNumber={phoneNumber}
              protectingSince={protectingSince}
            />

            {errorMessage ? (
              <ProfileErrorState message={errorMessage} onRetry={handleRefresh} />
            ) : (
              <ProfileChildrenCard
                canManageChildren={canManageChildren}
                childrenData={overviewChildren}
                onAddChildPress={handleAddChildPress}
                onChildPress={handleChildPress}
              />
            )}

            <View style={styles.cardSlot}>
              <CustomerSupportCard />
            </View>

            <View style={styles.cardSlot}>
              <ProfileLegalCard />
            </View>

            {user?.family.organization ? (
              <View style={styles.cardSlot}>
                <SwitchFamilyCard
                  disabled={leaveFamilyMutation.isPending}
                  onPress={confirmLeaveFamily}
                />
              </View>
            ) : null}

            <ProfileAccountActions
              isSigningOut={isSigningOut}
              onDeleteAccountPress={() => router.push('/delete-account/confirm' as never)}
              onSignOut={() => {
                void handleSignOut();
              }}
            />
          </ScrollView>
        </BlurTargetView>

        <View pointerEvents="box-none" style={styles.topBarOverlay}>
          <AppTabChrome
            animateThemeIcon={!isTransitioning}
            onThemeTogglePress={handleThemeToggle}
            onTopBarLayout={handleTopBarLayout}
            showCarousel={false}
            themeName={themeName}
            themeToggleDisabled={isTransitioning}
            topInset={insets.top}
          />
        </View>
      </View>

      <ParentProfileEditSheet
        initialValue={{
          avatarUrl: user?.avatarUrl ?? null,
          currentAddress: user?.currentAddress ?? null,
          dateOfBirth: user?.dateOfBirth ?? null,
          displayName,
          email: user?.email ?? null,
        }}
        onClose={() => setIsProfileEditVisible(false)}
        visible={isProfileEditVisible}
      />
      <FamilyInviteQrSheet
        familyName={familyName}
        onClose={() => setIsInviteSheetVisible(false)}
        visible={isInviteSheetVisible}
      />
      <ProfileAvatarLightbox
        avatarInitials={avatarInitials}
        avatarUrl={avatarUrl}
        displayName={displayName}
        onClose={() => setIsAvatarPreviewVisible(false)}
        onEditPhoto={() => setIsProfileEditVisible(true)}
        visible={isAvatarPreviewVisible}
      />
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
  blurTarget: {
    flex: 1,
  },
  topChromeSpacer: (height: number) => ({
    height,
  }),
  topBarOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    left: 0,
    zIndex: 54,
  },
  scroll: {
    flex: 1,
  },
  content: (bottomInset: number) => ({
    paddingBottom: Math.max(bottomInset, 16) + 80,
  }),
  header: {
    marginTop: theme.spacing[4],
    marginHorizontal: theme.spacing[5],
  },
  headerTitle: {
    color: theme.colors.text,
    fontFamily: theme.typography.family.display,
    ...theme.typography.text.display,
    fontWeight: theme.typography.weight.bold,
  },
  noticeWrap: {
    marginTop: theme.spacing[4],
    marginHorizontal: theme.spacing[5],
  },
  // Support and switch-family cards own their internals but not their placement.
  cardSlot: {
    marginTop: theme.spacing[4],
    marginHorizontal: theme.spacing[5],
  },
}));
